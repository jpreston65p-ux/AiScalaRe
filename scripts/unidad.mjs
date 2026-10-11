import { resolve } from 'node:path';
const [root,node,user] = process.argv.slice(2);
if(!root || !node || !/^[a-z_][a-z0-9_-]*\$?$/.test(user || '') || /[\r\n]/.test(root+node)) throw new Error('invalid_service_arguments');
const quote = value => '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/%/g,'%%')+'"';
console.log(`[Unit]
Description=SCALA WhatsApp QR
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=${user}
WorkingDirectory=${root.replace(/%/g,'%%')}
ExecStart=${quote(node)} --max-old-space-size=256 ${quote(resolve(root,'src/index.mjs'))} --servicio
Restart=on-failure
RestartSec=15
RestartPreventExitStatus=78
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${quote(resolve(root,'data'))}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target`);
