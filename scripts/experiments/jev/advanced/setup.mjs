import {existsSync,realpathSync,symlinkSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
const source=resolve('packages/router/fixtures/router/node_modules');
const target=resolve('scripts/experiments/jev/advanced/app/node_modules');
if(!existsSync(source))throw new Error('Install workspace dependencies before running these experiments.');
if(existsSync(target)){
 if(realpathSync(target)!==realpathSync(source))throw new Error('Existing app dependency directory differs; preserve it and inspect manually.');
}else symlinkSync(relative(dirname(target),source),target,'dir');
mkdirSync('/tmp/jev-advanced',{recursive:true});
console.log('Experiment app uses installed consumer dependencies; no package or lockfile changes.');
