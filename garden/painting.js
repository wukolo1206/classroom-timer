(function (root) {
    'use strict';
    var NS='http:/'+'/www.w3.org/2000/svg';
    var markup="<svg class=\"garden-art\" viewBox=\"0 0 1000 600\" preserveAspectRatio=\"none\" aria-hidden=\"true\" aria-label=\"由日間草地逐步完成為月光花園的構圖草案\">\n    <defs>\n     <linearGradient id=\"painting-sky\" x2=\"0\" y2=\"1\"><stop class=\"sky-stop\" stop-color=\"var(--sky-top)\"/><stop class=\"sky-stop\" offset=\"1\" stop-color=\"var(--sky-bottom)\"/></linearGradient>\n     <g id=\"painting-flower\"><path d=\"M0 27V0M0 16Q-14 3-12 14Q-7 22 0 20M0 19Q14 6 12 17Q6 25 0 23\" stroke=\"#87a966\" stroke-width=\"2.5\" fill=\"#9fbd7a\"/><g fill=\"currentColor\"><ellipse cy=\"-7\" rx=\"5\" ry=\"8\"/><ellipse cx=\"7\" rx=\"8\" ry=\"5\"/><ellipse cy=\"7\" rx=\"5\" ry=\"8\"/><ellipse cx=\"-7\" rx=\"8\" ry=\"5\"/></g><circle r=\"4\" fill=\"#e7bf70\"/></g>\n     <g id=\"painting-tree\"><path d=\"M0 0V-92\" stroke=\"#b69776\" stroke-width=\"14\" stroke-linecap=\"round\"/><g fill=\"var(--leaf)\"><circle cx=\"-30\" cy=\"-88\" r=\"40\"/><circle cx=\"26\" cy=\"-100\" r=\"46\"/><circle cx=\"-9\" cy=\"-128\" r=\"41\"/></g><g fill=\"#bdd1a1\" opacity=\".45\"><ellipse cx=\"-24\" cy=\"-106\" rx=\"22\" ry=\"15\"/><ellipse cx=\"31\" cy=\"-124\" rx=\"21\" ry=\"15\"/></g></g>\n     <g id=\"painting-butterfly\"><g fill=\"currentColor\"><ellipse cx=\"-7\" cy=\"-3\" rx=\"8\" ry=\"10\" transform=\"rotate(-20 -7 -3)\"/><ellipse cx=\"7\" cy=\"-3\" rx=\"8\" ry=\"10\" transform=\"rotate(20 7 -3)\"/><circle cx=\"-5\" cy=\"8\" r=\"6\"/><circle cx=\"5\" cy=\"8\" r=\"6\"/></g><path d=\"M0-8V12\" stroke=\"#8a7654\" stroke-width=\"2\"/></g>\n     <mask id=\"painting-moon-cut\"><rect width=\"1000\" height=\"600\" fill=\"white\"/><circle cx=\"748\" cy=\"65\" r=\"31\" fill=\"black\"/></mask>\n    </defs>\n    <path fill=\"url(#painting-sky)\" d=\"M0 0H1000V600H0Z\"/>\n    <g class=\"painting-sky-lights\"><g class=\"sun\"><circle cx=\"730\" cy=\"82\" r=\"47\" fill=\"#f8df9b\" opacity=\".18\"/><circle cx=\"730\" cy=\"82\" r=\"30\" fill=\"#f6d88b\"/></g>\n    <circle class=\"moon\" cx=\"730\" cy=\"82\" r=\"31\" fill=\"#fff2cf\" mask=\"url(#painting-moon-cut)\"/></g>\n    <g fill=\"#fffaf0\" opacity=\".65\"><ellipse cx=\"260\" cy=\"92\" rx=\"52\" ry=\"15\"/><circle cx=\"249\" cy=\"79\" r=\"21\"/><circle cx=\"279\" cy=\"86\" r=\"17\"/><ellipse cx=\"655\" cy=\"58\" rx=\"40\" ry=\"12\"/><circle cx=\"644\" cy=\"47\" r=\"17\"/></g>\n    <path d=\"M0 244Q105 162 210 227Q340 142 466 236Q620 145 750 229Q890 152 1000 223V600H0Z\" fill=\"var(--hill)\"/>\n    <path d=\"M0 267Q145 218 300 262Q510 207 690 260Q870 219 1000 258V600H0Z\" fill=\"#adc68b\" opacity=\".55\"/>\n    <g data-layer=\"trees\"><use href=\"#painting-tree\" x=\"122\" y=\"272\"/><use href=\"#painting-tree\" transform=\"translate(361 263) scale(.76)\"/><use href=\"#painting-tree\" transform=\"translate(641 270) scale(.88)\"/></g>\n    <path class=\"grass-fill\" d=\"M0 260Q190 220 420 252Q700 222 1000 255V600H0Z\" fill=\"var(--grass-far)\"/>\n    <path class=\"grass-fill\" d=\"M0 315Q215 273 440 310Q720 278 1000 308V600H0Z\" fill=\"var(--grass)\"/>\n    <g fill=\"#eee5bb\"><ellipse cx=\"515\" cy=\"279\" rx=\"21\" ry=\"5\"/><ellipse cx=\"490\" cy=\"305\" rx=\"24\" ry=\"7\"/><ellipse cx=\"531\" cy=\"338\" rx=\"29\" ry=\"8\"/><ellipse cx=\"487\" cy=\"377\" rx=\"34\" ry=\"10\"/><ellipse cx=\"535\" cy=\"424\" rx=\"40\" ry=\"12\"/><ellipse cx=\"483\" cy=\"480\" rx=\"48\" ry=\"15\"/><ellipse cx=\"533\" cy=\"548\" rx=\"58\" ry=\"19\"/></g>\n    <g data-layer=\"pond\"><path d=\"M880 264Q758 251 716 292Q685 325 795 351Q906 371 986 344Q1017 290 880 264Z\" fill=\"#a3bd88\"/><path d=\"M890 271Q777 257 734 294Q704 322 801 343Q911 361 980 336Q1002 296 890 271Z\" fill=\"var(--water)\"/><g stroke=\"#e5f1e8\" stroke-width=\"3\" stroke-linecap=\"round\" opacity=\".7\"><path d=\"M775 296h30M880 288h23M916 325h32M800 331h22\"/></g><ellipse cx=\"880\" cy=\"332\" rx=\"21\" ry=\"6\" fill=\"#8bb67f\"/><path d=\"M880 329Q865 313 868 309Q879 309 882 320Q879 301 887 299Q895 309 887 322Q901 311 904 316Q900 328 880 329Z\" fill=\"#efc1ca\"/></g>\n    <g data-layer=\"bridge\" fill=\"none\"><path d=\"M714 329Q848 265 988 327\" stroke=\"#c3a17c\" stroke-width=\"15\" stroke-linecap=\"round\"/><path d=\"M716 314Q848 250 987 312\" class=\"painting-bridge-rail\"/><path d=\"M740 318V303M784 298V283M830 289V274M875 290V275M921 300V285M965 317V302\" class=\"painting-bridge-rail\"/><path d=\"M744 322L740 312M780 307L777 297M819 296L817 286M859 294V284M900 299L903 289M939 310L943 300M976 325L980 315\" stroke=\"#a98661\" stroke-width=\"3\"/></g>\n    <g data-layer=\"stars\" id=\"painting-stars\" fill=\"#fff1bd\"></g>\n    <g data-layer=\"fireflies\" fill=\"#eeeaa2\" opacity=\".8\"><circle cx=\"182\" cy=\"304\" r=\"2.3\"/><circle cx=\"430\" cy=\"331\" r=\"2\"/><circle cx=\"625\" cy=\"292\" r=\"2.4\"/><circle cx=\"716\" cy=\"369\" r=\"2\"/><circle cx=\"886\" cy=\"250\" r=\"2.2\"/></g>\n   </svg>";

    var palettes=[['#c6e4e8','#e2efd8','#c4d994','#afc981','#95b479','#b4cea0','#add8dc'],['#efc898','#dfc1cf','#cad28e','#bac98c','#9eaf7b','#c2c399','#c8d0ca'],['#405773','#a8b1b1','#9eae83','#8fa27b','#859c7b','#9db18f','#9bbfc8']];
    function mount(scene){
        scene.insertAdjacentHTML('afterbegin',markup);
        var stars=scene.querySelector('#painting-stars');
        for(var j=0;j<12;j++){var star=document.createElementNS(NS,'path'),x=60+j*71%890,y=32+j*37%156;star.classList.add('garden-star');star.setAttribute('d','M'+x+' '+(y-4)+'L'+(x+1)+' '+(y-1)+'L'+(x+4)+' '+y+'L'+(x+1)+' '+(y+1)+'L'+x+' '+(y+4)+'L'+(x-1)+' '+(y+1)+'L'+(x-4)+' '+y+'L'+(x-1)+' '+(y-1)+'Z');star.style.animationDelay=(-j*.6)+'s';stars.appendChild(star);}
        scene.querySelectorAll('[data-layer="fireflies"] circle').forEach(function(f,i){f.classList.add('garden-firefly');f.style.animationDelay=(-i*.8)+'s';});
        scene._fixtureView=new window.GardenFixtures.View(scene.querySelector('.garden-art'));
        update(scene,0,true);
    }
    function update(scene,stage,immediate,presentation){
        var state=presentation||{},theme=state.discovery&&state.discovery.themeId||'bridge';
        var changed=scene._fixtureView.render(theme,state.dt||0,!!state.active,!!state.reduced,!!immediate);
        if(scene._paintingStage===stage&&!changed)return;scene._paintingStage=stage;scene._paintingChanged=true;
        scene.dataset.stage=stage;
        var palette=palettes[stage>=7?2:stage>=6?1:0];
        ['--sky-top','--sky-bottom','--grass','--grass-far','--leaf','--hill','--water'].forEach(function(k,i){scene.style.setProperty(k,palette[i]);});
        scene.querySelectorAll('.garden-art [data-layer]').forEach(function(g){g.style.opacity=stage>={trees:2,pond:4,bridge:5,stars:7,fireflies:7}[g.dataset.layer]?'1':'0';});
        if(immediate&&scene.getAnimations)scene.getAnimations({subtree:true}).forEach(function(a){if(typeof CSSTransition!=='undefined'&&a instanceof CSSTransition)a.finish();});
    }
    function setActive(scene,active){
        if(scene._paintingActive===active&&!scene._paintingChanged)return;
        scene._paintingActive=active;scene._paintingChanged=false;
        if(!scene.getAnimations)return;
        scene.getAnimations({subtree:true}).forEach(function(animation){
            var target=animation.effect&&animation.effect.target;if(target&&target.closest&&target.closest('.garden-hud'))return;
            if(typeof CSSTransition!=='undefined'&&animation instanceof CSSTransition){if(active)animation.play();else animation.pause();}
        });
    }
    // Materialize computed vector styling, so downloaded pictures need no page CSS,
    // foreignObject, network resource or private page URL.
    function vectorCopy(svg){
        var copy=svg.cloneNode(true),original=[svg].concat(Array.from(svg.querySelectorAll('*'))),clones=[copy].concat(Array.from(copy.querySelectorAll('*')));
        original.forEach(function(node,i){var style=getComputedStyle(node),out=clones[i];out.removeAttribute('class');out.removeAttribute('style');['stop-color','stop-opacity','fill','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity','opacity','visibility','transform','translate','rotate','scale','transform-origin','transform-box','font-family','font-size','font-weight','text-anchor'].forEach(function(key){var value=style.getPropertyValue(key);if(value){value=value.replace(/url\(["']?[^)"']*#([^)'" ]+)["']?\)/g,'url(#$1)');out.style.setProperty(key,value);}});});
        copy.removeAttribute('aria-hidden');copy.removeAttribute('role');copy.removeAttribute('aria-label');return copy;
    }
    function capture(scene,includeSeats){
        var box=scene.getBoundingClientRect(),w=scene.clientWidth,h=scene.clientHeight;
        var art=document.createElementNS(NS,'svg');art.setAttribute('xmlns',NS);art.setAttribute('width',w);art.setAttribute('height',h);art.setAttribute('viewBox','0 0 '+w+' '+h);
        var background=vectorCopy(scene.querySelector('.garden-art'));background.setAttribute('x','0');background.setAttribute('y','0');background.setAttribute('width',w);background.setAttribute('height',h);art.appendChild(background);
        function place(svg){
            var matrix=svg.getScreenCTM(),view=svg.viewBox.baseVal,c=vectorCopy(svg),group=document.createElementNS(NS,'g');
            if(!matrix||!view.width||!view.height)return;
            // One matrix maps original SVG coordinates to the scene. Never apply
            // a reflected bounding box and the reflection a second time.
            group.setAttribute('transform','matrix('+[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-box.left,matrix.f-box.top].join(' ')+')');
            c.style.transform='none';c.style.translate='none';c.style.rotate='none';c.style.scale='none';c.style.transformOrigin='0 0';c.style.overflow='visible';c.setAttribute('x',view.x);c.setAttribute('y',view.y);c.setAttribute('width',view.width);c.setAttribute('height',view.height);group.appendChild(c);art.appendChild(group);
        }
        scene.querySelectorAll('.garden-meadow-patch>svg,.garden-flower>svg,.garden-butterfly>svg').forEach(function(svg){place(svg);});
        Array.from(scene.querySelectorAll('.garden-visitor')).sort(function(a,b){return Number(a.style.zIndex)-Number(b.style.zIndex);}).forEach(function(person){
            var shadow=person.querySelector('.ground-shadow').getBoundingClientRect(),e=document.createElementNS(NS,'ellipse');e.setAttribute('cx',shadow.left-box.left+shadow.width/2);e.setAttribute('cy',shadow.top-box.top+shadow.height/2);e.setAttribute('rx',shadow.width/2);e.setAttribute('ry',shadow.height/2);e.setAttribute('fill','#526b3d');e.setAttribute('opacity','.2');art.appendChild(e);
            var prop=person.querySelector('.activity-prop>svg'),body=person.querySelector('.visitor-body>svg');var behind=person.dataset.activity==='picnic'||person.dataset.activity==='flowers';
            function add(svg){if(svg)place(svg);}
            if(behind)add(prop);add(body);if(!behind)add(prop);
            if(includeSeats){var label=person.querySelector('small'),r=label.getBoundingClientRect(),bg=document.createElementNS(NS,'rect');bg.setAttribute('x',r.left-box.left);bg.setAttribute('y',r.top-box.top);bg.setAttribute('width',r.width);bg.setAttribute('height',r.height);bg.setAttribute('rx',r.height/2);bg.setAttribute('fill','#fff9e9');art.appendChild(bg);var text=document.createElementNS(NS,'text');text.setAttribute('x',r.left-box.left+r.width/2);text.setAttribute('y',r.top-box.top+r.height*.72);text.setAttribute('text-anchor','middle');text.setAttribute('font-size',getComputedStyle(label).fontSize);text.setAttribute('font-family','sans-serif');text.setAttribute('font-weight','700');text.setAttribute('fill','#34553a');text.textContent=label.textContent;art.appendChild(text);}
        });
        return new XMLSerializer().serializeToString(art);
    }
    function toPng(svg){return new Promise(function(resolve,reject){var url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),img=new Image();img.onload=function(){try{var canvas=document.createElement('canvas');var scale=Math.min(2,2400/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);var ctx=canvas.getContext('2d');if(!ctx)throw Error('無法建立畫布');ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(function(blob){URL.revokeObjectURL(url);if(blob)resolve(blob);else reject(Error('無法產生圖片'));},'image/png');}catch(e){URL.revokeObjectURL(url);reject(e);}};img.onerror=function(){URL.revokeObjectURL(url);reject(Error('無法讀取畫作'));};img.src=url;});}
    function download(blob,filename){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}
    root.GardenPainting={mount:mount,update:update,setActive:setActive,capture:capture,toPng:toPng,download:download};
}(window));
