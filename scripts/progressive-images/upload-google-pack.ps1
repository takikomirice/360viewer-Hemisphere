param([Parameter(Mandatory=$true)][string]$PackDirectory,[Parameter(Mandatory=$true)][string]$HotspotRootId)
$ErrorActionPreference='Stop'
if($HotspotRootId -notmatch '^[\w-]+$'){throw 'Invalid root ID'}
$packPath=(Resolve-Path -LiteralPath $PackDirectory).Path
$manifest=Get-Content -LiteralPath (Join-Path $packPath 'manifest.json') -Raw | ConvertFrom-Json
if($manifest.schemaVersion -ne 1 -or $manifest.sceneId -notmatch '^[\w-]+$' -or $manifest.checksum -notmatch '^[a-f0-9]{32}$'){throw 'Invalid manifest'}
$taskAuth=(Get-Content "$env:USERPROFILE/.clasprc.json" -Raw | ConvertFrom-Json).tokens.default
$taskToken=Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -Body @{client_id=$taskAuth.client_id;client_secret=$taskAuth.client_secret;refresh_token=$taskAuth.refresh_token;grant_type='refresh_token'}
$taskHeaders=@{Authorization=('Bearer '+$taskToken.access_token)}
function Get-Children([string]$parent){
  $query=[Uri]::EscapeDataString("'$parent' in parents and trashed=false")
  $result=Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files?q=$query&fields=nextPageToken,files(id,name,size,md5Checksum)&pageSize=100" -Headers $taskHeaders
  if($result.nextPageToken){throw 'Unexpectedly large pack directory'}
  return @($result.files)
}
function Get-OrCreateFolder([string]$parent,[string]$name){
  $matches=@(Get-Children $parent | Where-Object {$_.name -eq $name})
  if($matches.Count -gt 1){throw 'Duplicate folder'}
  if($matches.Count -eq 1){return $matches[0].id}
  $body=@{name=$name;mimeType='application/vnd.google-apps.folder';parents=@($parent)}|ConvertTo-Json -Compress
  return (Invoke-RestMethod -Uri 'https://www.googleapis.com/drive/v3/files?fields=id' -Headers $taskHeaders -Method Post -ContentType 'application/json' -Body $body).id
}
$progressive=Get-OrCreateFolder $HotspotRootId 'progressive'
$folder=Get-OrCreateFolder $progressive "google-v1-$($manifest.sceneId)-$($manifest.checksum)"
$existing=Get-Children $folder
foreach($name in @($manifest.files.name)+@('manifest.json')){
  if($name -notmatch '^(preview|full|tile-(?:[0-9]|[12][0-9]|3[01]))\.jpg$|^manifest\.json$'){throw 'Invalid asset name'}
  $filePath=Join-Path $packPath $name
  $bytes=[IO.File]::ReadAllBytes($filePath)
  $md5=(Get-FileHash -LiteralPath $filePath -Algorithm MD5).Hash.ToLower()
  $matches=@($existing | Where-Object {$_.name -eq $name})
  if($matches.Count -gt 1){throw 'Duplicate asset'}
  if($matches.Count -eq 1){if($matches[0].md5Checksum -ne $md5){throw "Existing asset differs: $name"};continue}
  if($name -ne 'manifest.json'){
    $expected=$manifest.files | Where-Object {$_.name -eq $name}
    if($bytes.Length -ne $expected.bytes -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLower() -ne $expected.sha256){throw "Damaged local asset: $name"}
  }
  $mime=if($name -eq 'manifest.json'){'application/json'}else{'image/jpeg'}
  $boundary='hemisphere_'+[guid]::NewGuid().ToString('N')
  $metadata=@{name=$name;parents=@($folder)}|ConvertTo-Json -Compress
  $prefix=[Text.Encoding]::UTF8.GetBytes("--$boundary`r`nContent-Type: application/json; charset=UTF-8`r`n`r`n$metadata`r`n--$boundary`r`nContent-Type: $mime`r`n`r`n")
  $suffix=[Text.Encoding]::UTF8.GetBytes("`r`n--$boundary--`r`n")
  $body=[byte[]]::new($prefix.Length+$bytes.Length+$suffix.Length)
  [Array]::Copy($prefix,0,$body,0,$prefix.Length);[Array]::Copy($bytes,0,$body,$prefix.Length,$bytes.Length);[Array]::Copy($suffix,0,$body,$prefix.Length+$bytes.Length,$suffix.Length)
  $created=Invoke-RestMethod -Uri 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum' -Method Post -Headers $taskHeaders -ContentType "multipart/related; boundary=$boundary" -Body $body
  if($created.md5Checksum -ne $md5 -or [long]$created.size -ne $bytes.Length){throw "Upload verification failed: $name"}
  Write-Output "Verified $name ($($bytes.Length) bytes)"
}
Write-Output "Complete private pack: $folder"
