var utils_1 = require("./utils");
function sum(list) {
    var total = 0;
    for (var _i = 0; _i < list.length; _i++) {
        var num = list[_i];
        total += num;
    }
    return total;
}
function vecmul(a, b) {
    if (!a || !b || a.length !== b.length)
        throw new Error("Lists must be same length");
    var result = [];
    for (var i = 0, len = a.length; i < len; i++)
        result[i] = a[i] * b[i];
    return result;
}
var _layouts = [
    { size: 4, c: "big" },
    { size: 2, c: "detailed" },
    { size: 1, c: "normal", grouped: 2 },
];
function masonry(elem) {
    var _a = elem.seed, seed = _a === void 0 ? 0 : _a, _b = elem.rowSize, rowSize = _b === void 0 ? 8 : _b, _c = elem.layouts, layouts = _c === void 0 ? _layouts : _c, _d = elem.styles, styles = _d === void 0 ? undefined : _d, children = elem.children;
    var rand = utils_1.srand(seed);
    layouts.sort(utils_1.sortByField("size"));
    // Assign notional tiles an initial size based on the visual frequency of each layout
    var ix = 0;
    var tilesPerLayout = [];
    var totalLayoutFreq = 0;
    var sizes = [];
    for (var _i = 0; _i < layouts.length; _i++) {
        var layout = layouts[_i];
        layout.freq = layout.freq || 1 / layout.size;
        totalLayoutFreq += layout.freq;
    }
    for (var _e = 0; _e < layouts.length; _e++) {
        var layout = layouts[_e];
        sizes[ix] = layout.size;
        tilesPerLayout[ix++] = Math.round(layout.freq / totalLayoutFreq * children.length);
    }
    // Ensure every notional tile has an assigned size (to fix rounding errors)
    var total;
    var tryIx = 0;
    while ((total = sum(tilesPerLayout)) !== children.length) {
        if (sum(tilesPerLayout) > children.length)
            tilesPerLayout[tilesPerLayout.length - 1] -= 1;
        else if (sum(tilesPerLayout) < children.length)
            tilesPerLayout[tilesPerLayout.length - 1] += 1;
    }
    // Optimize distribution of notional tiles to maximally fill rows
    tryIx = 0, ix = 0;
    var minSize = layouts[layouts.length - 1].size;
    while (true) {
        var filledSize_1 = sum(vecmul(tilesPerLayout, sizes));
        var rowCount_1 = Math.ceil(filledSize_1 / rowSize);
        var delta = rowSize * rowCount_1 - filledSize_1;
        if (delta <= 0 || tryIx++ > 1000)
            break;
        // Since we'll be shifting one of the smallest layout tiles to a bigger size, we offset by that size
        if (ix === layouts.length - 1)
            ix = 0;
        if (delta >= layouts[ix].size - minSize) {
            tilesPerLayout[layouts.length - 1]--;
            tilesPerLayout[ix]++;
        }
        else if (ix === layouts.length - 2) {
            // The second smallest size was still too large, we're done.
            break;
        }
        ix++;
    }
    // Assign discrete tiles to sizes based on their relative size ordering
    children.sort(utils_1.sortByField("size"));
    var tiles = [], layoutIx = 0, tileIx = 0;
    for (var _f = 0; _f < tilesPerLayout.length; _f++) {
        var count = tilesPerLayout[_f];
        var layout = layouts[layoutIx++];
        if (!layout.grouped) {
            for (var ix_1 = tileIx; ix_1 < tileIx + count; ix_1++) {
                var tile = children[ix_1];
                tile.c = "tile " + (tile.c || "") + " " + (layout.c || "");
                if (styles)
                    tile.c += " " + styles[tileIx % styles.length];
                if (layout.format)
                    tile = layout.format(tile);
                tiles.push({ c: "group " + (layout.c || ""), layout: layout, size: layout.size, children: [tile] });
            }
        }
        else {
            // Grouped layouts are grouped at this stage to keep the layout process 1-dimensional
            var added = 0;
            ;
            for (var ix_2 = tileIx; ix_2 < tileIx + count; ix_2 += layout.grouped) {
                var group = { c: "group " + (layout.c || ""), layout: layout, size: layout.size * layout.grouped, children: [] };
                for (var partIx = 0; partIx < layout.grouped && added < count; partIx++) {
                    var tile = children[ix_2 + partIx];
                    tile.c = "tile " + (tile.c || "") + " " + (layout.c || "");
                    if (styles)
                        tile.c += " " + styles[(tileIx + partIx) % styles.length];
                    if (layout.format)
                        tile = layout.format(tile);
                    group.children.push(tile);
                    added++;
                }
                tiles.push(group);
            }
        }
        tileIx += count;
    }
    // @TODO: Pull tiles from bag, distributing them evenly into rows
    var filledSize = sum(vecmul(tilesPerLayout, sizes));
    var rowCount = Math.ceil(filledSize / rowSize);
    var rows = [];
    for (var ix_3 = 0; ix_3 < rowCount; ix_3++)
        rows.push({ c: "masonry-row", children: [], size: 0 });
    tryIx = 0;
    var rowIx = 0;
    for (var _g = 0; _g < tiles.length; _g++) {
        var tile = tiles[_g];
        var size = tile.layout.size * (tile.layout.grouped || 1);
        var placed = false;
        var attempts = 0;
        while (!placed) {
            var row = rows[rowIx];
            if (row.size + size <= rowSize) {
                row.size += size;
                row.children.push(tile);
                placed = true;
            }
            rowIx++;
            if (rowIx >= rowCount)
                rowIx = 0;
            attempts++;
            if (attempts === rowCount)
                break;
        }
        if (!placed)
            console.error("Could not place tile", tile);
    }
    ix = 0;
    // Shuffle the row contents and the set of rows for pleasing irregularity
    for (var _h = 0; _h < rows.length; _h++) {
        var row = rows[_h];
        utils_1.shuffle(row.children, rand);
    }
    utils_1.shuffle(rows, rand);
    elem.c = "masonry " + (elem.c || "");
    elem.children = rows;
    return elem;
}
exports.masonry = masonry;
//# sourceMappingURL=masonry.js.map