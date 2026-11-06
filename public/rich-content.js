(() => {
 const KATEX='/vendor/katex-0.19.1/';
 let diagramId=0;
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},fontFamily:'sans-serif',theme:'base',themeVariables:{primaryColor:'#ffffff',primaryTextColor:'#1b181c',primaryBorderColor:'#000000',lineColor:'#000000',secondaryColor:'#ffffff',tertiaryColor:'#ffffff'},maxTextSize:30000,maxEdges:200,suppressErrorRendering:true});
 function error(parent,message,source){const block=document.createElement('span');block.className='rich-error';block.textContent=message+'：'+source;parent.append(block);}
 function math(parent,source,display,redact){
  const span=document.createElement('span');span.className=display?'math-block':'math-inline';parent.append(span);
  try{
   if(source.length>10000)throw new Error('数式が長すぎます');
   katex.render(source,span,{displayMode:display,throwOnError:true,output:'htmlAndMathml',maxExpand:1000,maxSize:20,strict:code=>code==='htmlExtension'?'ignore':'warn',trust:context=>context.command==='\\htmlClass'&&['math-red','math-normal'].includes(context.class),macros:{'\\red':redact?'\\underline{\\htmlClass{math-red}{#1}}':'\\htmlClass{math-normal}{#1}'}});
  }catch{span.replaceChildren();error(span,'数式の記法を確認してください',source);}
 }
 function closing(text,delimiter,start){let pos=text.indexOf(delimiter,start);while(pos>=0){let n=0;for(let i=pos-1;i>=0&&text[i]==='\\';i--)n++;if(n%2===0)return pos;pos=text.indexOf(delimiter,pos+delimiter.length);}return -1;}
 function inline(parent,text,redact,assets){
  let plain='';const flush=()=>{if(plain){parent.append(plain);plain='';}};
  for(let i=0;i<text.length;){
   if(text[i]==='\\'&&text[i+1]==='$'){plain+='$';i+=2;continue;}
   if(text.startsWith('**',i)){
    const end=closing(text,'**',i+2);
    if(end>=0){flush();const strong=document.createElement('strong');if(redact)strong.className='term';inline(strong,text.slice(i+2,end),redact,assets);parent.append(strong);i=end+2;continue;}
   }
   if(text[i]==='$'){
    const delimiter=text[i+1]==='$'?'$$':'$';const end=closing(text,delimiter,i+delimiter.length);
    if(end>=0){flush();math(parent,text.slice(i+delimiter.length,end),delimiter==='$$',redact);i=end+delimiter.length;continue;}
   }
   if(text.startsWith('![',i)){
    const match=/^!\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^()\n]+))\)/.exec(text.slice(i));
    if(match){flush();const src=assets.get((match[2]??match[3]).trim());if(src){const image=document.createElement('img');image.className='note-image';image.src=src;image.alt=match[1];parent.append(image);}i+=match[0].length;continue;}
   }
   plain+=text[i++];
  }
  flush();
 }
 function diagram(parent,source,redact){
  const host=document.createElement('div');host.className='note-diagram';host.tabIndex=0;host.setAttribute('role','img');host.setAttribute('aria-label','教材の図');parent.append(host);
  host.textContent='図を表示しています…';
  queueMicrotask(async()=>{
   if(!host.isConnected)return;
   const measure=document.createElement('div');measure.className='diagram-measure';document.body.append(measure);
   try{
    if(source.length>30000||/^\s*---/m.test(source)||/%%\s*\{/.test(source)||/^\s*click\b/m.test(source))throw new Error('unsupported configuration');
    const {svg}=await mermaid.render('lesson-diagram-'+(++diagramId),source,measure);
    if(!host.isConnected)return;
    const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');const root=parsed.documentElement;
    if(root.localName!=='svg'||root.querySelector('parsererror'))throw new Error('invalid SVG');
    // Keep diagrams inert even if a diagram type generates interactive SVG.
    root.querySelectorAll('script,foreignObject,image,iframe,object,embed').forEach(n=>n.remove());
    for(const el of [root,...root.querySelectorAll('*')])for(const attr of [...el.attributes])if(/^on/i.test(attr.name)||/^(?:href|xlink:href)$/i.test(attr.name))el.removeAttribute(attr.name);
    host.replaceChildren(document.importNode(root,true));
    const rendered=host.querySelector('svg');rendered.setAttribute('aria-hidden','true');
    // :::red marks labels, preserving black outlines and an underline through the sheet.
    if(redact)for(const group of rendered.querySelectorAll('.red')){
     group.classList.add('diagram-red');
     for(const text of group.querySelectorAll('text')){
      const bounds=text.getBBox();if(!bounds.width)continue;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('diagram-underline');line.setAttribute('x1',bounds.x);line.setAttribute('x2',bounds.x+bounds.width);line.setAttribute('y1',bounds.y+bounds.height+2);line.setAttribute('y2',bounds.y+bounds.height+2);text.after(line);
     }
    }
   }catch{host.replaceChildren();error(host,'図の記法を確認してください',source);}
   finally{measure.remove();}
  });
 }
 window.redsheetRich={inline,math,diagram};
})();
