(function(root,factory){
    'use strict';
    if(typeof module==='object'&&module.exports)module.exports=factory();else root.GardenActivities=factory();
}(typeof window==='object'?window:this,function(){
    'use strict';
    var labels={basketball:'打籃球',soccer:'踢足球',volleyball:'玩排球',tennis:'托網球',baseball:'接棒球',badminton:'托羽球',sowing:'播種',planting:'移苗種花',watering:'澆水'};
    var palettes=[['#deaa72','#92b5bd','#a3ba83'],['#d8a3ad','#b5a4c7','#9cb9b2'],['#b7c58d','#e2b783','#99b8cd']];
    function ball(x,y,r,color,lines,cls){return '<g class="'+cls+'"><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" stroke="#856f60" stroke-width="1.4"/>'+lines+'</g>';}
    function propSvg(id,variant){
        var p=palettes[Math.max(0,Math.min(2,Math.floor(variant)||0))],c=p[0],d=p[1],e=p[2],art='';
        if(id==='basketball')art=ball(77,75,9,c,'<path d="M68 75H86M77 66V84M71 68Q81 75 71 82M83 68Q73 75 83 82" fill="none" stroke="#856f60" stroke-width="1.2"/>','life-dribble');
        if(id==='soccer')art=ball(75,85,8,e,'<path d="M75 80L80 84L78 89H72L70 84Z" fill="#697d72"/><path d="M75 77V80M83 85L80 84M78 89L80 92M72 89L70 92M70 84L67 85" stroke="#697d72"/>','life-foot-ball');
        if(id==='volleyball')art=ball(76,73,9,d,'<path d="M68 70Q79 69 81 80M74 64Q72 74 67 77M85 71Q76 76 74 82" fill="none" stroke="#fff6df" stroke-width="2"/>','life-toss');
        if(id==='tennis'||id==='badminton'){
            art='<g class="life-racket"><path d="M67 84L77 65" stroke="'+c+'" stroke-width="5" stroke-linecap="round"/><ellipse cx="81" cy="56" rx="9" ry="13" transform="rotate(22 81 56)" fill="'+d+'" fill-opacity=".3" stroke="'+c+'" stroke-width="3"/><path d="M76 46L85 66M72 52L88 59M73 58L87 64M81 43L88 61" stroke="#f6e9ce" stroke-width="1"/></g>';
            art+=id==='tennis'?ball(77,34,4,e,'<path d="M74 31Q78 34 74 37" fill="none" stroke="#fff9de"/>','life-tennis-ball'):'<g class="life-shuttle"><path d="M75 34L69 23L81 22L79 34Z" fill="#fff4d9" stroke="'+d+'"/><path d="M72 24L76 33M77 23V33" stroke="'+d+'"/><ellipse cx="77" cy="35" rx="3" ry="3" fill="'+c+'"/></g>';
        }
        if(id==='baseball')art='<g class="life-glove"><path d="M64 75Q57 66 63 63L69 68L67 56Q69 52 72 57L75 65L76 53Q81 51 81 57L82 67L87 58Q92 58 90 64L87 80Q77 91 67 83Z" fill="'+c+'" stroke="#947555" stroke-width="1.5"/><path d="M69 70Q80 68 83 77M69 76L75 82" stroke="#fff0d2" fill="none"/></g>'+ball(79,70,5,'#fff2dc','<path d="M76 66Q81 70 76 74M82 66Q77 70 82 74" stroke="'+d+'" fill="none"/>','life-catch-ball');
        if(id==='sowing'||id==='planting'){
            art='<path d="M64 78H91L87 95H68Z" fill="'+c+'" stroke="#9c7e5a" stroke-width="1.5"/><ellipse cx="77" cy="78" rx="14" ry="4" fill="#92765e"/>';
            if(id==='sowing')art+='<g class="life-seed-bag"><path d="M62 61L72 57L80 69L66 75Z" fill="'+d+'" stroke="#8b9c89"/><path d="M67 62L71 65M70 61L74 64" stroke="#fff4d6"/></g><g class="life-seeds" fill="#e5cb84"><ellipse cx="74" cy="69" rx="1.5" ry="2"/><ellipse cx="79" cy="72" rx="1.5" ry="2"/></g><path d="M90 68L85 76L91 79L95 71Z" fill="'+e+'" stroke="#8e9e8a"/>';
            else art+='<g class="life-seedling"><path d="M77 77V54M77 65Q62 49 65 61Q70 70 77 68M77 62Q92 46 88 59Q83 66 77 65" fill="'+e+'" stroke="#7f9f62" stroke-width="2"/><ellipse cx="77" cy="78" rx="6" ry="3" fill="#755f4c"/></g><path class="life-pat" d="M60 76Q68 72 71 77L68 81L60 80Z" fill="'+d+'"/>';
        }
        if(id==='watering')art='<g class="life-can"><path d="M64 65H81L85 82H67Z" fill="'+d+'"/><path d="M81 67Q96 59 92 74L84 78M65 73L54 68L51 72L67 81" stroke="'+c+'" fill="none" stroke-width="4"/></g>';
        var scale=['basketball','soccer','volleyball'].indexOf(id)>=0?1.4:1.3;
        return '<svg viewBox="0 0 100 100" xmlns="http:/'+'/www.w3.org/2000/svg"><g class="life-'+id+'" data-palette="'+(variant||0)+'" transform="translate(3 0) translate(77 90) scale('+scale+') translate(-77 -90)">'+art+'</g></svg>';
    }
    return {labels:labels,palettes:palettes,propSvg:propSvg};
}));
