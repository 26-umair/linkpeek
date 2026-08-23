import fs from 'node:fs/promises';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

async function crc32File(filePath) {
  const fh = await fs.open(filePath, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  let crc = 0xFFFFFFFF;
  try {
    let pos = 0;
    while (true) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      for (let i = 0; i < bytesRead; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
  } finally { await fh.close(); }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(date = new Date()) { let year=Math.max(1980,date.getFullYear()); const time=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2); const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(); return {time,date:day}; }
async function appendFileHandle(out,filePath,startPos){const input=await fs.open(filePath,'r');const buf=Buffer.allocUnsafe(1024*1024);let pos=0,outPos=startPos;try{while(true){const{bytesRead}=await input.read(buf,0,buf.length,pos);if(!bytesRead)break;pos+=bytesRead;await out.write(buf,0,bytesRead,outPos);outPos+=bytesRead}}finally{await input.close()}return outPos}
export async function createZip(files,outputPath){const out=await fs.open(outputPath,'w');const central=[];let offset=0;try{for(const item of files){const stat=await fs.stat(item.path);if(stat.size>0xFFFFFFFF)throw new Error('A file is too large for this ZIP implementation.');const name=Buffer.from(item.name.replace(/\\/g,'/'),'utf8');const crc=await crc32File(item.path);const dt=dosDateTime(stat.mtime);const localOffset=offset;const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt16LE(0,8);h.writeUInt16LE(dt.time,10);h.writeUInt16LE(dt.date,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(stat.size,18);h.writeUInt32LE(stat.size,22);h.writeUInt16LE(name.length,26);h.writeUInt16LE(0,28);await out.write(h,0,h.length,offset);offset+=h.length;await out.write(name,0,name.length,offset);offset+=name.length;offset=await appendFileHandle(out,item.path,offset);central.push({name,crc,size:stat.size,localOffset,dt})}const centralStart=offset;for(const e of central){const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(0x0800,8);h.writeUInt16LE(0,10);h.writeUInt16LE(e.dt.time,12);h.writeUInt16LE(e.dt.date,14);h.writeUInt32LE(e.crc,16);h.writeUInt32LE(e.size,20);h.writeUInt32LE(e.size,24);h.writeUInt16LE(e.name.length,28);h.writeUInt16LE(0,30);h.writeUInt16LE(0,32);h.writeUInt16LE(0,34);h.writeUInt16LE(0,36);h.writeUInt32LE(0,38);h.writeUInt32LE(e.localOffset,42);await out.write(h,0,h.length,offset);offset+=h.length;await out.write(e.name,0,e.name.length,offset);offset+=e.name.length}const centralSize=offset-centralStart;if(central.length>0xFFFF||offset>0xFFFFFFFF)throw new Error('ZIP batch is too large. Split it into smaller batches.');const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(centralStart,16);end.writeUInt16LE(0,20);await out.write(end,0,end.length,offset);offset+=end.length}finally{await out.close()}return offset}
