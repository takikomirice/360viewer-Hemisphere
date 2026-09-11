(function (root) {
  'use strict';
  function createImageQueue(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw new Error('Concurrency must be between 1 and 16');
    const pending = [], jobs = new Map();
    let active = 0, sequence = 0;
    function drain() {
      pending.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
      while (active < limit && pending.length) {
        const job = pending.shift();
        active++;
        Promise.resolve().then(job.task).then(
          value => job.resolve({ status: 'loaded', value }),
          error => job.resolve({ status: 'failed', error })
        ).finally(() => {
          active--;
          jobs.delete(job.key);
          drain();
        });
      }
    }
    return {
      add(key, task, priority = 0) {
        if (jobs.has(key)) return jobs.get(key).promise;
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        const job = { key, task, priority, resolve, promise, sequence: sequence++ };
        jobs.set(key, job);
        pending.push(job);
        drain();
        return promise;
      },
      cancelPending(predicate = () => true) {
        for (let i = pending.length - 1; i >= 0; i--) {
          const job = pending[i];
          if (!predicate(job.key)) continue;
          pending.splice(i, 1);
          jobs.delete(job.key);
          job.resolve({ status: 'cancelled' });
        }
      }
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createImageQueue };
  else root.createImageQueue = createImageQueue;
})(typeof globalThis !== 'undefined' ? globalThis : this);
