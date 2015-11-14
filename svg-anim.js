
/*
 * SVG-animate
 *
 * FRAN-style animations for SVG in Javascript
 *
 */


/* 
   TODO:

   - close up in a module
   - record initial transform so that we can keep it around even 
     after we wipe everything out because of a new tag
   - implement scaling

*/


function mkBehavior (type,stream) {
    return {type:type, stream:stream};
}

function isBehavior (b) {
    return (typeof b === "object" && "type" in b && "stream" in b);
}


// types: scalar, array
//    

var time = mkBehavior("scalar",function(t) { return t; });


function faster (r,s) {
    var ls = lift(s);
    var lr = lift(r);
    return mkBehavior(ls.type,function (t) { return ls.stream(t * lr.stream(t)); });
}


function slower (r,s) { 
    return faster(1/r,s);
}


// this will fail if 'v' is an array, but that's okay because that would be
// cheating (faking an overlay with an array of scalars?)

function lift (v) { 
  return isBehavior(v) ? v : mkBehavior("scalar",function(t) { return v; });
}



/*
 * Format function
 *
 * Use % as placeholder
 *
 */

(function(){

    function fmt () {
	var i = 0, args = arguments;
	return this.replace(/%/g, function () {
	    return typeof args[i] != 'undefined' ? args[i++] : '';
	});
    }

    if (!String.fmt) {
	String.prototype.fmt = fmt
    }
})();



function rotate_node (node,deg,rx,ry) {
    ///console.log(node,deg,rx,ry);
    var s = d3.select(node);
    if (s.property("svg-animation-tag") != tag) {
	///console.log("rotate - new tag",tag,"replacing",s.property("svg-animation-tag"));
	s.property("svg-animation-tag",tag);
	s.attr("transform","rotate(%,%,%)".fmt(deg,rx,ry));
    } else {
	var t = s.attr("transform")
	///console.log("rotate - existing tag",tag,"adding to",t);
	s.attr("transform","rotate(%,%,%) %".fmt(deg,rx,ry,t));
    }
}


function translate_node (node,x,y) {
    var s = d3.select(node);
    if (+s.property("svg-animation-tag") !== tag) {
	s.property("svg-animation-tag",tag);
	///console.log("translate - new tag",tag,"replacing",s.property("svg-animation-tag"));
	s.attr("transform","translate(%,%)".fmt(x,y));
    } else {
	var t = s.attr("transform")
	///console.log("transform - existing tag",tag,"adding to",t);
	s.attr("transform","translate(%,%) %".fmt(x,y,t));
    }
}


function add (s1,s2) { 
    var ls1 = lift(s1);
    var ls2 = lift(s2);
    return mkBehavior("scalar",function(t) { return ls1.stream(t) + ls2.stream(t); });
}

function mult (s1,s2) { 
    var ls1 = lift(s1);
    var ls2 = lift(s2);
    return mkBehavior("scalar",function(t) { return ls1.stream(t) * ls2.stream(t); });
}

function apply (f,s) {
    var ls = lift(s);
    return mkBehavior("scalar",function(t) { return f(ls.stream(t)); });
}


var animId = 0;


// DIRTY DIRTY HACK!
// also, cannot have more than one animate call active at a time
// there has to be a better way of doing this
//
// pass the current animation tag along with the time?
//  the absolute time stamp might be useful anyway...

var tag;

function animate (s,duration) { 

    if (animId !== 0) {
	cancelAnimationFrame(animId);
	animId = 0;
    }

    var start = performance.now();
    var now;

    var liftedS = lift(s);

    var goWithDuration = function() { 
	///console.log("--------------------");
	now = performance.now()-start;
	tag = now;
	if (now < duration) { 
	    liftedS.stream(now);
	    animId = requestAnimationFrame(goWithDuration);
	} else {
	    console.log("BUSTED!");
	}
    }

    var go = function() { 
	///console.log("--------------------");
	now = performance.now()-start;
	tag = now;
	liftedS.stream(now);
	animId = requestAnimationFrame(go);
    }

    if (undef(duration)) { 
	go();
    } else {
	goWithDuration();
    }

}

function stop () {
    if (animId !== 0) {
	cancelAnimationFrame(animId);
	animId = 0;
    }
}

function print (s) { 
    return function(t) { console.log("@",t,"=",s.stream(t)); };
}

var deg = apply(function(x) { return x % 360; },time);

function undef (x) { 
    return typeof x === "undefined";
}



// cx and cy should themselves be behaviors as well

function rotate (nodes,s,cx,cy) { 
    var nodes = lift(nodes);
    var ls = lift(s);
    var process_node = function(n,angle) { 
	var x = undef(cx) ? n.x : cx;
	var y = undef(cy) ? n.y : cy;
	rotate_node(n.elt, angle, x, y);
	return n;
    }
	
    ///console.log(nodes);
    return mkBehavior(nodes.type,
		      function(t) { 
			  var angle = ls.stream(t);
			  if (nodes.type==="scalar") {
			      return process_node(nodes.stream(t),angle);
			  } else {
			      return nodes.stream(t).map(function(n) { return process_node(n,angle); });
			  }
		      });
}


function translate (nodes,x,y) { 
    var lnodes = lift(nodes);
    var lx = lift(x);
    var ly = lift(y);
	
    return mkBehavior(nodes.type,
		      function(t) { 
			  var dx = lx.stream(t);
			  var dy = ly.stream(t);
			  var ns = lnodes.stream(t);
			  if (lnodes.type==="scalar") {
			      translate_node(ns.elt,dx,dy);
			      return ns;
			  } else {
			      ns.forEach(function(n) { return translate_node(n.elt,dx,dy); });
			      return ns;
			  }
		      });
}

var wiggle = mkBehavior("scalar", function (t) { return Math.sin(t); });
var waggle = mkBehavior("scalar", function (t) { return Math.cos(t); });

function element (id,orig_x,orig_y) { 
    var e = document.getElementById(id);
    return mkBehavior("scalar",function(t) { return {elt:e, x:orig_x, y:orig_y};  });
}


// FIXME
function threshold (s1,thres,s2) {
    return function(t) { 
	if (t<thres) {
	    return s1(t);
	} else {
	    return s2(t-thres);
	}
    }
}



function overlay () {
    var args = [];

    for (var i=0; i<arguments.length; i++) {
	///console.log("argument",i,"=",arguments[i]);
	args.push(lift(arguments[i]));
    }

    ///console.log(args);
    
    temp =  mkBehavior("array",
		      function(t) { 
			  return  args.map(function(s) { return s.stream(t); });
		      });

    return temp;
}


function delay (d,s) { 
    var ls = lift(s)
    return mkBehavior(ls.type,
		      function(t) { 
			  if (t < d) {
			      return;
			  }
			  return ls.stream(t-d);
		      });
}


// generalize this

function rampTo (n,d) { 
    return mkBehavior("scalar",
		      function(t) { 
			  if (t<d) { 
			      return (n*t/d);
			  }
			  return n;
		      });
}


function spin (e,s) {
    return faster(s,rotate(e,deg));
}



// invariant: 
//  time is always local to a behavior
//  behavior always starts @ t = 0


function loadExternalSVG (file,target_id,f) { 

    d3.html(file, function(d) {
        console.log("loading svg", d);
	var elt = document.getElementById(target_id);
	elt.appendChild(d);
	f();
    });
}


