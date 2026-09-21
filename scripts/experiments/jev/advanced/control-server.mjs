import {createServer} from 'vite';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const modal=process.argv.includes('--modal');
const server=await createServer({root:resolve('scripts/experiments/jev/advanced/app'),configFile:resolve('scripts/experiments/jev/advanced/control.vite.config.ts'),mode:modal?'modal-control':'todo-control',server:{host:'127.0.0.1',port:modal?4393:4392,strictPort:true,watch:null}});
await server.listen();writeFileSync(`/tmp/jev-advanced/${modal?'modal':'todo'}-control-server.json`,JSON.stringify({url:server.resolvedUrls.local[0],pid:process.pid}));server.printUrls();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0)});
