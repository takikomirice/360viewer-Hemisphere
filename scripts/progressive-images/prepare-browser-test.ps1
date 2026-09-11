$ErrorActionPreference='Stop'
$repository=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$destination=Join-Path $repository 'output/quality-audit/google-progressive'
New-Item -ItemType Directory -Force $destination | Out-Null
foreach($extension in @('js','css')){
  Invoke-WebRequest -UseBasicParsing -Uri "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.$extension" -OutFile (Join-Path $destination "pannellum-2.5.6.$extension")
}
$actual=(Get-FileHash (Join-Path $destination 'pannellum-2.5.6.js') -Algorithm SHA256).Hash
if($actual -ne 'A28B2F7B339FD0A602C6769DF1DCA6AD43AF73BC8C6A5BE67209715289C12A9A'){throw 'Unexpected Pannellum 2.5.6 build'}
Write-Output 'Pannellum 2.5.6 browser-test assets ready; runtime dependencies unchanged.'
