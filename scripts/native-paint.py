# Development-only capture utility. Never point --config at a real account configuration.
import os,pty,fcntl,termios,struct,select,time,signal,sys,json,codecs

import pyte
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Rasterize genuine Claude PTY output without inference. Requires pyte 0.8.2 and Pillow.')
parser.add_argument('--cli',required=True,help='Path to isolated Claude cli-wrapper.cjs 2.1.292+')
parser.add_argument('--config',required=True,help='Temporary isolated Claude configuration, initialized interactively with dummy API key only')
parser.add_argument('--workspace',required=True,help='Trusted empty temporary workspace')
parser.add_argument('--out',required=True,help='Output directory')
args=parser.parse_args()
ROOT=str(Path(__file__).resolve().parent.parent)
CLI=str(Path(args.cli).resolve())
FONT=ROOT+'/plugins/apex/web/assets/jetbrains-mono.ttf'
OUT=str(Path(args.out).resolve());Path(OUT).mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype(FONT,15)
for cols,name in [(144,'native-terminal-rail'),(80,'native-terminal-inline')]:
 rows=40
 pid,fd=pty.fork()
 if pid==0:
  os.chdir(args.workspace)
  env={'PATH':os.environ['PATH'],'TERM':'xterm-256color','LANG':'en_US.UTF-8','CLAUDE_CONFIG_DIR':str(Path(args.config).resolve()),'ANTHROPIC_API_KEY':'apex-offline-preview','ANTHROPIC_BASE_URL':'http://127.0.0.1:9','APEX_AA_API_KEY':'','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','DISABLE_AUTOUPDATER':'1','FORCE_COLOR':'1'}
  os.execvpe('node',['node',CLI,'--setting-sources','','--strict-mcp-config','--plugin-dir',ROOT+'/plugins/apex'],env)
 fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0))
 screen=pyte.Screen(cols,rows);stream=pyte.Stream(screen);raw=[]; decoder=codecs.getincrementaldecoder('utf-8')('replace')
 def read(seconds):
  until=time.monotonic()+seconds
  while time.monotonic()<until:
   if select.select([fd],[],[],0.1)[0]:
    try:data=decoder.decode(os.read(fd,65536))
    except OSError:return
    raw.append(data);stream.feed(data)
 def save(suffix):
  text='\n'.join(screen.display)
  assert 'APEX' in text,text
  im=Image.new('RGB',(cols*9+32,rows*21+66),'#0b0c10');draw=ImageDraw.Draw(im)
  draw.text((16,12),'REAL HOST PTY / '+str(cols)+' COLS / RASTERIZED ANSI / NO INFERENCE',font=font,fill='#e8a33d')
  colors={'default':'#e9ebf1','black':'#0b0c10','red':'#f07370','green':'#3ecf8e','brown':'#e8a33d','yellow':'#e8a33d','blue':'#5b8cff','magenta':'#c792ea','cyan':'#69cbd6','white':'#e9ebf1'}
  for y in range(rows):
   for x in range(cols):
    ch=screen.buffer[y][x];fg=colors.get(ch.fg,'#'+ch.fg if len(ch.fg)==6 else '#e9ebf1')
    if ch.reverse:draw.rectangle((16+x*9,50+y*21,25+x*9,71+y*21),fill='#e9ebf1');fg='#0b0c10'
    draw.text((16+x*9,50+y*21),ch.data,font=font,fill=fg)
  im.save(OUT+'/'+name+suffix+'.png')
  open(OUT+'/'+name+suffix+'.txt','w').write(text)
 read(3)
 os.write(fd,b'/apex rail\r');read(2);save('')
 os.write(fd,b'/apex mode sports\r');read(2);save('-pending')
 os.write(fd,b'\x03\x03');read(.5)
 os.kill(pid,signal.SIGTERM)
 os.waitpid(pid,0);os.close(fd)
 print(name+' captured',flush=True)
