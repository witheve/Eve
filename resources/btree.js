/*
            B+ Tree processing
              Version 1.0.2
     Written by Graham O'Neill, April 2013
        http://goneill.co.nz/btree.php
*/


// ========== Data structures ==========
(function(window) {

leaf = function () {
  this.keyval = [];
  this.recnum = [];
	this.prevLf = null;
  this.nextLf = null;
};

node = function () {
	this.keyval = [];
	this.nodptr = [];
};

tree = function (order) {
	// Private
	this.root = new leaf();
	this.maxkey = order-1;
	this.minkyl = Math.floor(order/2);
	this.minkyn = Math.floor(this.maxkey/2);
	this.leaf = null;
	this.item = -1;
	// Public
	this.keyval = '';
	this.recnum = -1;
	this.length = 0;
	this.eof = true;
	this.found = false;
};


// ========== Method prototypes ==========

// ---------- Leaf nodes ----------

leaf.prototype.isLeaf = function() {return true;}

leaf.prototype.getItem = function (key,near) {
	var vals = this.keyval;
	if (near) {
		for (var i=0, len=vals.length; i<len; i++) {
			if (key <= vals[i]) return i;
		}
	} else {
		for (var i=0, len=vals.length; i<len; i++) {
			if (key === vals[i]) return i;
		}
	}
	return -1;
}

leaf.prototype.addKey = function (key,rec) {
	var vals = this.keyval;
	var itm = vals.length;
	for (var i=0, len=itm; i<len; i++) {
		if (key === vals[i]) {
			itm = -1;
			break;
		}
		if (key <= vals[i]) {
			itm = i;
			break;
		}
	}
	if (itm != -1) {
		for (var i=vals.length; i>itm; i--) {
			vals[i] = vals[i-1];
			this.recnum[i] = this.recnum[i-1];
		}
		vals[itm] = key;
		this.recnum[itm] = rec;
	}
	return itm;
}

leaf.prototype.split = function () {
	var mov = Math.floor(this.keyval.length/2);
	var newL = new leaf();
	for (var i=mov-1; i>=0; i--) {
		newL.keyval[i] = this.keyval.pop();
		newL.recnum[i] = this.recnum.pop();
	}
	newL.prevLf = this;
	newL.nextLf = this.nextLf;
	if (this.nextLf !== null) this.nextLf.prevLf = newL;
	this.nextLf = newL;
	return newL;
}

leaf.prototype.merge = function (frNod, paNod, frKey) {
	for (var i=0, len=frNod.keyval.length; i<len; i++) {
		this.keyval.push(frNod.keyval[i]);
		this.recnum.push(frNod.recnum[i]);
	}
	this.nextLf = frNod.nextLf;
	if (frNod.nextLf !== null) frNod.nextLf.prevLf = this;
	frNod.prevLf = null;
	frNod.nextLf = null;
	var itm = paNod.keyval.length-1;
	for (var i=itm; i>=0; i--) {
		if (paNod.keyval[i] == frKey) {
			itm = i;
			break;
		}
	}
	for (var i=itm, len=paNod.keyval.length-1; i<len; i++) {
		paNod.keyval[i] = paNod.keyval[i+1];
		paNod.nodptr[i+1] = paNod.nodptr[i+2];
	}
	paNod.keyval.pop();
	paNod.nodptr.pop();
}


// ---------- Internal nodes ----------

node.prototype.isLeaf = function() {return false;}

node.prototype.getItem = function (key) {
	var vals = this.keyval;
	for (var i=0, len=vals.length; i<len; i++) {
		if (key < vals[i]) return i;
	}
	return vals.length;
}

node.prototype.addKey = function (key,ptrL,ptrR) {
	var vals = this.keyval;
	var itm = vals.length;
	for (var i=0, len=vals.length; i<len; i++) {
		if (key <= vals[i]) {
			itm = i;
			break;
		}
	}
	for (var i=vals.length; i>itm; i--) {
		vals[i] = vals[i-1];
		this.nodptr[i+1] = this.nodptr[i];
	}
	vals[itm] = key;
	this.nodptr[itm] = ptrL;
	this.nodptr[itm+1] = ptrR;
}

node.prototype.split = function () {
	var mov = Math.ceil(this.keyval.length/2) - 1;
	var newN = new node();
	newN.nodptr[mov] = this.nodptr.pop();
	for (var i=mov-1; i>=0; i--) {
		newN.keyval[i] = this.keyval.pop();
		newN.nodptr[i] = this.nodptr.pop();
	}
	return newN;
}

node.prototype.merge = function (frNod, paNod, paItm) {
	var del = paNod.keyval[paItm];
	this.keyval.push(del);
	for (var i=0, len=frNod.keyval.length; i<len; i++) {
		this.keyval.push(frNod.keyval[i]);
		this.nodptr.push(frNod.nodptr[i]);
	}
	this.nodptr.push(frNod.nodptr[frNod.nodptr.length-1]);
	for (var i=paItm, len=paNod.keyval.length-1; i<len; i++) {
		paNod.keyval[i] = paNod.keyval[i+1];
		paNod.nodptr[i+1] = paNod.nodptr[i+2];
	}
	paNod.keyval.pop();
	paNod.nodptr.pop();
	return del;
}


// ---------- B+ Tree ----------

tree.prototype.insert = function (key,rec) {
	var stack = [];
	this.leaf = this.root;
	while (!this.leaf.isLeaf()) {
		stack.push(this.leaf);
		this.item = this.leaf.getItem(key);
		this.leaf = this.leaf.nodptr[this.item];
	}
	this.item = this.leaf.addKey(key,rec);
	this.keyval = key;
	this.eof = false;
	if (this.item == -1) {
		this.found = true;
		this.item = this.leaf.getItem(key,false);
		this.recnum = this.leaf.recnum[this.item];
	} else {
		this.found = false;
		this.recnum = rec;
		this.length++;
		if (this.leaf.keyval.length > this.maxkey) {
			var pL = this.leaf;
			var pR = this.leaf.split();
			var ky = pR.keyval[0];
			this.item = this.leaf.getItem(key,false);
			if (this.item == -1) {
				this.leaf = this.leaf.nextLf;
				this.item = this.leaf.getItem(key,false);
			}
			while (true) {
				if (stack.length == 0) {
					var newN = new node();
					newN.keyval[0] = ky;
					newN.nodptr[0] = pL;
					newN.nodptr[1] = pR;
					this.root = newN;
					break;
				}
				var nod = stack.pop();
				nod.addKey(ky,pL,pR);
				if (nod.keyval.length <= this.maxkey) break;
				pL = nod;
				pR = nod.split();
				ky = nod.keyval.pop();
			}
		}
	}
	return (!this.found);
}

tree.prototype.remove = function (key) {
	if (typeof key == 'undefined') {
		if (this.item == -1) {
			this.eof = true;
			this.found = false;
			return false;
		}
		key = this.leaf.keyval[this.item];
	}
	this._del(key);
	if (!this.found) {
		this.item = -1;
		this.eof = true;
		this.keyval = '';
		this.recnum = -1;
	} else {
		this.seek(key,true);
		this.found = true;
	}
	return (this.found);
}

tree.prototype.seek = function (key,near) {
	if (typeof near != 'boolean') near = false;
	this.leaf = this.root;
	while (!this.leaf.isLeaf()) {
		this.item = this.leaf.getItem(key);
		this.leaf = this.leaf.nodptr[this.item];
	}
	this.item = this.leaf.getItem(key,near);
	if (near && this.item ==-1 && this.leaf.nextLf!==null) {
		this.leaf = this.leaf.nextLf;
		this.item = 0;
	}
	if (this.item == -1) {
		this.eof = true;
		this.keyval = '';
		this.found = false;
		this.recnum = -1;
	} else {
		this.eof = false;
		this.found = (this.leaf.keyval[this.item] === key);
		this.keyval = this.leaf.keyval[this.item];
		this.recnum = this.leaf.recnum[this.item];
	}
	return (!this.eof);
}

tree.prototype.skip = function (cnt) {
	if (typeof cnt != 'number') cnt = 1;
	if (this.item==-1 || this.leaf===null) this.eof = true;
	if (cnt > 0) {
		while (!this.eof && this.leaf.keyval.length - this.item - 1 < cnt) {
			cnt = cnt - this.leaf.keyval.length + this.item;
			this.leaf = this.leaf.nextLf;
			if (this.leaf === null) this.eof = true;
			else                    this.item = 0;
		}
		if (!this.eof) this.item = this.item + cnt;
	} else {
		cnt = -cnt;
		while (!this.eof && this.item < cnt) {
			cnt = cnt - this.item - 1;
			this.leaf = this.leaf.prevLf;
			if (this.leaf === null) this.eof = true;
			else                    this.item = this.leaf.keyval.length-1;
		}
		if (!this.eof) this.item = this.item - cnt;
	}
	if (this.eof) {
		this.item = -1;
		this.found = false;
		this.keyval = '';
		this.recnum = -1;
	} else {
		this.found = true;
		this.keyval = this.leaf.keyval[this.item];
		this.recnum = this.leaf.recnum[this.item];
	}
	return (this.found);
}

tree.prototype.goto = function (cnt) {
	if (cnt < 0) {
		this.goBottom();
		if (!this.eof) this.skip(cnt+1);
	} else {
		this.goTop();
		if (!this.eof) this.skip(cnt-1);
	}
	return (this.found);
}

tree.prototype.keynum = function () {
	if (this.leaf === null || this.item == -1) return -1;
	var cnt = this.item + 1;
	var ptr = this.leaf;
	while (ptr.prevLf !== null) {
		ptr = ptr.prevLf;
		cnt += ptr.keyval.length;
	}
	return cnt;
}

tree.prototype.goTop = function () {
	this.leaf = this.root;
	while (!this.leaf.isLeaf()) {
		this.leaf = this.leaf.nodptr[0];
	}
	if (this.leaf.keyval.length == 0) {
		this.item = -1;
		this.eof = true;
		this.found = false;
		this.keyval = '';
		this.recnum = -1;
	} else {
		this.item = 0;
		this.eof = false;
		this.found = true;
		this.keyval = this.leaf.keyval[0];
		this.recnum = this.leaf.recnum[0];
	}
	return (this.found);
}

tree.prototype.goBottom = function () {
	this.leaf = this.root;
	while (!this.leaf.isLeaf()) {
		this.leaf = this.leaf.nodptr[this.leaf.nodptr.length-1];
	}
	if (this.leaf.keyval.length == 0) {
		this.item = -1;
		this.eof = true;
		this.found = false;
		this.keyval = '';
		this.recnum = -1;
	} else {
		this.item = this.leaf.keyval.length-1;
		this.eof = false;
		this.found = true;
		this.keyval = this.leaf.keyval[this.item];
		this.recnum = this.leaf.recnum[this.item];
	}
	return (this.found);
}

tree.prototype.pack = function () {
	this.goTop(0);
	if (this.leaf == this.root) return;

	// Pack leaves
	var toN = new leaf();
	var toI = 0;
	var frN = this.leaf;
	var frI = 0;
	var parKey = [];
	var parNod = [];
	while (true) {
		toN.keyval[toI] = frN.keyval[frI];
		toN.recnum[toI] = frN.recnum[frI];
		if (toI == 0) parNod.push(toN);
		if (frI == frN.keyval.length-1) {
			if (frN.nextLf === null) break;
			frN = frN.nextLf;
			frI = 0;
		} else {
			frI++;
		}
		if (toI == this.maxkey-1) {
			var tmp = new leaf();
			toN.nextLf = tmp;
			tmp.prevLf = toN;
			toN = tmp;
			toI = 0;
		} else {
			toI++;
		}
	}
	var mov = this.minkyl - toN.keyval.length;
	frN = toN.prevLf;
	if (mov > 0 && frN !== null) {
		for (var i=toN.keyval.length-1; i>=0; i--) {
			toN.keyval[i+mov] = toN.keyval[i];
			toN.recnum[i+mov] = toN.recnum[i];
		}
		for (var i=mov-1; i>=0; i--) {
			toN.keyval[i] = frN.keyval.pop();
			toN.recnum[i] = frN.recnum.pop();
		}
	}
	for (i=1, len=parNod.length; i<len; i++) {
		parKey.push(parNod[i].keyval[0]);
	}
	parKey[parKey.length] = null;

	// Rebuild nodes
	while (parKey[0] !== null) {
		kidKey = parKey;
		kidNod = parNod;
		parKey = [];
		parNod = [];
		var toI = this.maxkey+1;
		for (var i=0, len=kidKey.length; i<len; i++) {
			if (toI > this.maxkey) {
				toN = new node();
				toI = 0;
				parNod.push(toN);
			}
			toN.keyval[toI] = kidKey[i];
			toN.nodptr[toI] = kidNod[i];
			toI++;
		}
		mov = this.minkyn - toN.keyval.length + 1;
		if (mov > 0 && parNod.length > 1) {
			for (var i=toN.keyval.length-1; i>=0; i--) {
				toN.keyval[i+mov] = toN.keyval[i];
				toN.nodptr[i+mov] = toN.nodptr[i];
			}
			frN = parNod[parNod.length-2];
			for (var i=mov-1; i>=0; i--) {
				toN.keyval[i] = frN.keyval.pop();
				toN.nodptr[i] = frN.nodptr.pop();
			}
		}
		for (var i=0, len=parNod.length; i<len; i++) {
			parKey.push(parNod[i].keyval.pop());
		}
	}
	this.root = parNod[0];
	this.goTop();
	return (this.found);
}


// ----- Deletion methods -----

tree.prototype._del = function (key) {
	var stack = [];
	var parNod = null;
	var parPtr = -1;
	this.leaf = this.root;
	while (!this.leaf.isLeaf()) {
		stack.push(this.leaf);
		parNod = this.leaf;
		parPtr = this.leaf.getItem(key);
		this.leaf = this.leaf.nodptr[parPtr];
	}
	this.item = this.leaf.getItem(key,false);

	// Key not in tree
	if (this.item == -1) {
		this.found = false;
		return;
	}
	this.found = true;

	// Delete key from leaf
	for (var i=this.item, len=this.leaf.keyval.length-1; i<len; i++) {
		this.leaf.keyval[i] = this.leaf.keyval[i+1];
		this.leaf.recnum[i] = this.leaf.recnum[i+1];
	}
	this.leaf.keyval.pop();
	this.leaf.recnum.pop();
	this.length--;

	// Leaf still valid: done
	if (this.leaf == this.root) return;
	if (this.leaf.keyval.length >= this.minkyl) {
		if (this.item == 0) this._fixNodes(stack, key, this.leaf.keyval[0]);
		return;
	}
	var delKey;

	// Steal from left sibling if possible
	var sibL = (parPtr == 0) ? null : parNod.nodptr[parPtr-1];
	if (sibL !== null && sibL.keyval.length > this.minkyl) {
		delKey = (this.item == 0) ? key : this.leaf.keyval[0];
		for (var i=this.leaf.keyval.length; i>0; i--) {
			this.leaf.keyval[i] = this.leaf.keyval[i-1];
			this.leaf.recnum[i] = this.leaf.recnum[i-1];
		}
		this.leaf.keyval[0] = sibL.keyval.pop();
		this.leaf.recnum[0] = sibL.recnum.pop();
		this._fixNodes(stack, delKey, this.leaf.keyval[0]);
		return;
	}

	// Steal from right sibling if possible
	var sibR = (parPtr == parNod.keyval.length) ? null : parNod.nodptr[parPtr+1];
	if (sibR !== null && sibR.keyval.length > this.minkyl) {
		this.leaf.keyval.push(sibR.keyval.shift());
		this.leaf.recnum.push(sibR.recnum.shift());
		if (this.item == 0) this._fixNodes(stack, key, this.leaf.keyval[0]);
		this._fixNodes(stack, this.leaf.keyval[this.leaf.keyval.length-1], sibR.keyval[0]);
		return;
	}

	// Merge left to make one leaf
	if (sibL !== null) {
		delKey = (this.item == 0) ? key : this.leaf.keyval[0];
		sibL.merge(this.leaf, parNod, delKey);
		this.leaf = sibL;
	} else {
		delKey = sibR.keyval[0];
		this.leaf.merge(sibR, parNod, delKey);
		if (this.item == 0) this._fixNodes(stack, key, this.leaf.keyval[0]);
	}

	if (stack.length == 1 && parNod.keyval.length == 0) {
		this.root = this.leaf;
		return;
	}

	var curNod = stack.pop();
	var parItm;

	// Update all nodes
	while (curNod.keyval.length < this.minkyn && stack.length > 0) {

		parNod = stack.pop();
		parItm = parNod.getItem(delKey);

		// Steal from right sibling if possible
		sibR = (parItm == parNod.keyval.length) ? null : parNod.nodptr[parItm+1];
		if (sibR !== null && sibR.keyval.length > this.minkyn) {
			curNod.keyval.push(parNod.keyval[parItm]);
			parNod.keyval[parItm] = sibR.keyval.shift();
			curNod.nodptr.push(sibR.nodptr.shift());
			break;
		}

		// Steal from left sibling if possible
		sibL = (parItm == 0) ? null : parNod.nodptr[parItm-1];
		if (sibL !== null && sibL.keyval.length > this.minkyn) {
			for (var i=curNod.keyval.length; i>0; i--) {
				curNod.keyval[i] = curNod.keyval[i-1];
			}
			for (var i=curNod.nodptr.length; i>0; i--) {
				curNod.nodptr[i] = curNod.nodptr[i-1];
			}
			curNod.keyval[0] = parNod.keyval[parItm-1];
			parNod.keyval[parItm-1] = sibL.keyval.pop();
			curNod.nodptr[0] = sibL.nodptr.pop();
			break;
		}

		// Merge left to make one node
		if (sibL !== null) {
			delKey = sibL.merge(curNod, parNod, parItm-1);
			curNod = sibL;
		} else if (sibR !== null) {
			delKey = curNod.merge(sibR, parNod, parItm);
		}

		// Next level
		if (stack.length == 0 && parNod.keyval.length == 0) {
			this.root = curNod;
			break;
		}
		curNod = parNod;
	}
}

tree.prototype._fixNodes = function (stk, frKey, toKey) {
	var nod, lvl=stk.length, mor=true;
	do {
		lvl--;
		vals = stk[lvl].keyval;
		for (var i=vals.length-1; i>=0; i--) {
			if (vals[i] == frKey) {
				vals[i] = toKey;
				mor = false;
				break;
			}
		}
	} while (mor && lvl>0);
}


window.btree = tree;

})(window);
