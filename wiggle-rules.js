/*
 * wiggle-rules.js — Wiggle 配置/得点の純粋ルールエンジン
 *
 * 目的: 配置判定・得点判定を UI / グローバル state から切り離し、
 *       盤面データを引数で受け取る副作用なしの関数にする。
 *       これにより固定テスト（rules-test.html）で回帰検証できる。
 *
 * 注意: ここはハテナ（外周キャップ）無しの基盤ルール。
 *       本体 index.html の detectCompletedPatterns は questionBoard が空のとき
 *       この detectClosedPatterns と同じ結果になる（＝サバイバル / ハテナ無しポップジャムと一致）。
 *
 * 盤面フォーマット:
 *   board = 5x5 の二次元配列。各セルは null または { tile: { id, start? }, rotation }。
 *   スタートタイルは tile.start === true もしくは tile.id === 25。
 */
(function (global) {
  "use strict";

  var COLORS = ["red", "yellow", "blue"];
  var START_ID = 25;

  // 本体 index.html と同じ定数（変更時は両方そろえる）
  var detectionSampleSize = 28;
  var lineWidth = 0.045;
  var edgeSampleCount = 11;

  var DIR_INDEX = { top: 0, right: 1, bottom: 2, left: 3 };
  var DIR_VEC = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // N,E,S,W
  var DIR_OPP = [2, 3, 0, 1];
  var DIR_ADJ = [[1, 3], [0, 2], [1, 3], [0, 2]];
  var TRI_CX = [0.5, 0.75, 0.5, 0.25];
  var TRI_CY = [0.25, 0.5, 0.75, 0.5];

  var tileShapes = {
    1: { type: "solid", colors: ["red"] },
    2: { type: "solid", colors: ["yellow"] },
    3: { type: "solid", colors: ["blue"] },
    4: { type: "half", colors: ["red", "blue"] },
    5: { type: "half", colors: ["yellow", "red"] },
    6: { type: "half", colors: ["blue", "yellow"] },
    7: { type: "top", colors: ["red", "blue"] },
    8: { type: "top", colors: ["yellow", "red"] },
    9: { type: "top", colors: ["blue", "yellow"] },
    10: { type: "top", colors: ["blue", "red"] },
    11: { type: "top", colors: ["red", "yellow"] },
    12: { type: "top", colors: ["yellow", "blue"] },
    13: { type: "cross2", colors: ["red", "blue"] },
    14: { type: "cross2", colors: ["yellow", "red"] },
    15: { type: "cross2", colors: ["blue", "yellow"] },
    16: { type: "cross3", colors: ["red", "blue", "yellow"] },
    17: { type: "cross3", colors: ["yellow", "red", "blue"] },
    18: { type: "cross3", colors: ["blue", "yellow", "red"] },
    19: { type: "three", colors: ["red", "blue", "yellow"] },
    20: { type: "three", colors: ["yellow", "red", "blue"] },
    21: { type: "three", colors: ["blue", "yellow", "red"] },
    22: { type: "three", colors: ["red", "yellow", "blue"] },
    23: { type: "three", colors: ["yellow", "blue", "red"] },
    24: { type: "three", colors: ["blue", "red", "yellow"] },
    25: { type: "start", colors: ["red", "yellow", "blue"] }
  };

  function nearLine(value) {
    return Math.abs(value) < lineWidth;
  }

  // セル内座標 (x,y∈0..1) の色を返す。"" は白い分割線/無色。
  function getTileBaseColor(tileId, x, y) {
    var shape = tileShapes[tileId];
    if (!shape) {
      return "";
    }

    if (shape.type === "solid") {
      return shape.colors[0];
    }

    if (shape.type === "half") {
      if (nearLine(x + y - 1)) {
        return "";
      }
      return x + y < 1 ? shape.colors[0] : shape.colors[1];
    }

    if (shape.type === "top") {
      var leftLine = x <= 0.5 && nearLine(y - x);
      var rightLine = x >= 0.5 && nearLine(y - (1 - x));
      if (leftLine || rightLine) {
        return "";
      }
      return y < Math.min(x, 1 - x) ? shape.colors[0] : shape.colors[1];
    }

    if (shape.type === "cross2" || shape.type === "cross3" || shape.type === "cross4") {
      if (nearLine(y - x) || nearLine(y - (1 - x))) {
        return "";
      }
      if (y < x && y < 1 - x) {
        return shape.colors[0];
      }
      if (y > x && y > 1 - x) {
        return shape.type === "cross4" ? shape.colors[2] : shape.colors[0];
      }
      if (x < 0.5) {
        return shape.colors[1];
      }
      if (shape.type === "cross4") {
        return shape.colors[3];
      }
      return shape.type === "cross3" ? shape.colors[2] : shape.colors[1];
    }

    if (shape.type === "three") {
      if (nearLine(x + y - 1) || (x + y >= 1 && nearLine(y - x))) {
        return "";
      }
      if (x + y < 1) {
        return shape.colors[0];
      }
      return y < x ? shape.colors[2] : shape.colors[1];
    }

    if (shape.type === "start") {
      if (nearLine(y - x) || nearLine(y - (1 - x))) {
        return "";
      }
      if (y < x && y < 1 - x) {
        return "red";
      }
      if (y > x && y > 1 - x) {
        return "red";
      }
      if (x < 0.5) {
        return "blue";
      }
      return "yellow";
    }

    return "";
  }

  // 回転を考慮してセル内 (localX,localY) ピクセルの色を返す
  function sampleTileColor(tileId, rotation, localX, localY) {
    var x = (localX + 0.5) / detectionSampleSize;
    var y = (localY + 0.5) / detectionSampleSize;
    var normalizedRotation = ((rotation % 360) + 360) % 360;

    for (var i = 0; i < normalizedRotation / 90; i++) {
      var nextX = y;
      y = 1 - x;
      x = nextX;
    }

    return getTileBaseColor(tileId, x, y);
  }

  function sampleTileEdgeColor(tileId, rotation, edge, sampleIndex) {
    var size = detectionSampleSize;
    var t = (sampleIndex + 1) / (edgeSampleCount + 1);
    var position = Math.max(0, Math.min(size - 1, Math.floor(t * size)));

    if (edge === "top") {
      return sampleTileColor(tileId, rotation, position, 0);
    }
    if (edge === "bottom") {
      return sampleTileColor(tileId, rotation, position, size - 1);
    }
    if (edge === "left") {
      return sampleTileColor(tileId, rotation, 0, position);
    }
    return sampleTileColor(tileId, rotation, size - 1, position);
  }

  var baseEdgeCache = {};
  function baseEdgeColors(tileId) {
    if (!baseEdgeCache[tileId]) {
      baseEdgeCache[tileId] = [
        getTileBaseColor(tileId, 0.5, 0.25),
        getTileBaseColor(tileId, 0.75, 0.5),
        getTileBaseColor(tileId, 0.5, 0.75),
        getTileBaseColor(tileId, 0.25, 0.5)
      ];
    }
    return baseEdgeCache[tileId];
  }

  function rotateEdges(base, rotation) {
    var steps = (((rotation / 90) % 4) + 4) % 4;
    return base.map(function (_, i) {
      return base[(i - steps + 4) % 4];
    });
  }

  function getTriangleColor(tile, rotation, dirIndex) {
    return rotateEdges(baseEdgeColors(tile.id), rotation || 0)[dirIndex];
  }

  function isStart(tile) {
    return Boolean(tile && (tile.start || tile.id === START_ID));
  }

  // 辺が接続するか（同色 / どちらかがスタートなら可）
  function edgesConnect(tileA, rotationA, edgeA, tileB, rotationB, edgeB) {
    if (isStart(tileA) || isStart(tileB)) {
      return true;
    }
    for (var i = 0; i < edgeSampleCount; i++) {
      var colorA = sampleTileEdgeColor(tileA.id, rotationA, edgeA, i);
      var colorB = sampleTileEdgeColor(tileB.id, rotationB, edgeB, i);
      if (!colorA || !colorB || colorA !== colorB) {
        return false;
      }
    }
    return true;
  }

  function hasPlacedTile(board, row, col) {
    return row >= 0 && row < 5 && col >= 0 && col < 5 && Boolean(board[row] && board[row][col]);
  }

  var EDGE_CHECKS = [
    { dr: -1, dc: 0, own: "top", other: "bottom", label: "上" },
    { dr: 1, dc: 0, own: "bottom", other: "top", label: "下" },
    { dr: 0, dc: -1, own: "left", other: "right", label: "左" },
    { dr: 0, dc: 1, own: "right", other: "left", label: "右" }
  ];

  // 配置可能か（隣接が1つ以上あり、接する全ての辺で色が一致）
  function canPlace(board, row, col, tile, rotation) {
    if (!tile) {
      return false;
    }
    if (board[row][col]) {
      return false;
    }
    var hasNeighbor = false;
    var ok = true;
    EDGE_CHECKS.forEach(function (check) {
      var nr = row + check.dr;
      var nc = col + check.dc;
      if (!hasPlacedTile(board, nr, nc)) {
        return;
      }
      hasNeighbor = true;
      var neighbor = board[nr][nc];
      if (!edgesConnect(tile, rotation, check.own, neighbor.tile, neighbor.rotation || 0, check.other)) {
        ok = false;
      }
    });
    return ok && hasNeighbor;
  }

  // 置ける/置けない理由を返す（UI 表示用）。
  // ok は edgesConnect による厳密判定。ラベルの色は辺中央の三角色（目安）。
  function explainPlace(board, row, col, tile, rotation) {
    if (!tile) {
      return { ok: false, reasons: ["タイルが選ばれていません"] };
    }
    if (board[row][col]) {
      return { ok: false, reasons: ["そのマスは既に埋まっています"] };
    }

    var reasons = [];
    var hasNeighbor = false;
    var ok = true;

    EDGE_CHECKS.forEach(function (check) {
      var nr = row + check.dr;
      var nc = col + check.dc;
      if (!hasPlacedTile(board, nr, nc)) {
        return;
      }
      hasNeighbor = true;
      var neighbor = board[nr][nc];

      if (isStart(tile) || isStart(neighbor.tile)) {
        reasons.push(check.label + ": スタート＝全色OK");
        return;
      }

      var ownColor = getTriangleColor(tile, rotation, DIR_INDEX[check.own]) || "無";
      var otherColor = getTriangleColor(neighbor.tile, neighbor.rotation || 0, DIR_INDEX[check.other]) || "無";
      if (edgesConnect(tile, rotation, check.own, neighbor.tile, neighbor.rotation || 0, check.other)) {
        reasons.push(check.label + ": ○ 一致(" + ownColor + ")");
      } else {
        ok = false;
        reasons.push(check.label + ": × 不一致 自分=" + ownColor + " / 相手=" + otherColor);
      }
    });

    if (!hasNeighbor) {
      reasons.push("隣接タイルが無い（孤立配置は不可）");
    }

    return { ok: ok && hasNeighbor, reasons: reasons };
  }

  // 閉じた同色成分（模様）の検出。ハテナ無し。
  function detectClosedPatterns(board) {
    var results = [];

    COLORS.forEach(function (color) {
      var active = new Set();
      var parent = {};

      function find(x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      function union(a, b) {
        parent[find(a)] = find(b);
      }
      function nodeId(r, c, d) {
        return (r * 5 + c) * 4 + d;
      }
      function triColor(r, c, d) {
        var cell = board[r][c];
        if (!cell) {
          return null;
        }
        if (isStart(cell.tile)) {
          var nr = r + DIR_VEC[d][0];
          var nc = c + DIR_VEC[d][1];
          if (!hasPlacedTile(board, nr, nc)) {
            return null;
          }
          var ncell = board[nr][nc];
          if (isStart(ncell.tile)) {
            return null;
          }
          return getTriangleColor(ncell.tile, ncell.rotation || 0, DIR_OPP[d]);
        }
        return getTriangleColor(cell.tile, cell.rotation || 0, d);
      }

      var r, c, d;
      for (r = 0; r < 5; r++) {
        for (c = 0; c < 5; c++) {
          if (!board[r][c]) {
            continue;
          }
          for (d = 0; d < 4; d++) {
            var t = triColor(r, c, d);
            if (t !== null && t === color) {
              var id = nodeId(r, c, d);
              active.add(id);
              parent[id] = id;
            }
          }
        }
      }

      active.forEach(function (id) {
        var d2 = id % 4;
        var cellIdx = Math.floor(id / 4);
        var c2 = cellIdx % 5;
        var r2 = Math.floor(cellIdx / 5);

        // スタートタイルは白線で4三角が区切られているので自セル内は連結しない
        if (!isStart(board[r2][c2].tile)) {
          DIR_ADJ[d2].forEach(function (ad) {
            var aid = nodeId(r2, c2, ad);
            if (active.has(aid)) {
              union(id, aid);
            }
          });
        }

        var nr = r2 + DIR_VEC[d2][0];
        var nc = c2 + DIR_VEC[d2][1];
        if (hasPlacedTile(board, nr, nc)) {
          var pid = nodeId(nr, nc, DIR_OPP[d2]);
          if (active.has(pid)) {
            union(id, pid);
          }
        }
      });

      var components = new Map();
      active.forEach(function (id) {
        var root = find(id);
        if (!components.has(root)) {
          components.set(root, []);
        }
        components.get(root).push(id);
      });

      components.forEach(function (nodes) {
        var open = false;
        var sumX = 0;
        var sumY = 0;
        var coords = [];

        nodes.forEach(function (id) {
          var d2 = id % 4;
          var cellIdx = Math.floor(id / 4);
          var c2 = cellIdx % 5;
          var r2 = Math.floor(cellIdx / 5);
          var nr = r2 + DIR_VEC[d2][0];
          var nc = c2 + DIR_VEC[d2][1];

          if (!hasPlacedTile(board, nr, nc)) {
            open = true; // 空き/盤外に面する → 開いている（ハテナ無し）
          } else if (triColor(nr, nc, DIR_OPP[d2]) !== color) {
            open = true; // 異なる色に面する → 開いている
          }

          var gx = c2 + TRI_CX[d2];
          var gy = r2 + TRI_CY[d2];
          coords.push({ r: r2, c: c2, d: d2, gx: gx, gy: gy, start: isStart(board[r2][c2].tile) });
          sumX += gx;
          sumY += gy;
        });

        if (open) {
          return;
        }

        var centerX = sumX / coords.length;
        var centerY = sumY / coords.length;
        var labelCol = Math.max(0, Math.min(4, Math.floor(centerX)));
        var labelRow = Math.max(0, Math.min(4, Math.floor(centerY)));

        var cellSet = {};
        coords.forEach(function (p) {
          cellSet[p.r + "," + p.c] = { r: p.r, c: p.c };
        });
        var cells = Object.keys(cellSet).map(function (k) {
          return cellSet[k];
        });

        results.push({
          color: color,
          points: Math.max(1, Math.floor(coords.length / 2)),
          nodeCount: coords.length,
          row: labelRow,
          col: labelCol,
          localX: (centerX - labelCol) * 100,
          localY: (centerY - labelRow) * 100,
          cells: cells,
          triangles: coords.map(function (p) {
            return { r: p.r, c: p.c, d: p.d, start: p.start };
          }),
          key: color + ":" + nodes.slice().sort(function (a, b) {
            return a - b;
          }).join(",")
        });
      });
    });

    return results;
  }

  // ============================================================
  // 座標無制限（ボーダレス）版。5x5 の制約を持たず、配置済みセルを
  // 「"r,c" -> { tile, rotation }」のマップ（Map または プレーンobject）で扱う。
  // 図形・色・回転の判定は上の純粋関数を流用する。
  // ============================================================

  function dynGet(map, r, c) {
    var key = r + "," + c;
    if (map && typeof map.get === "function") {
      return map.get(key) || null;
    }
    return (map && map[key]) || null;
  }
  function dynHas(map, r, c) {
    return Boolean(dynGet(map, r, c));
  }
  function dynKeys(map) {
    if (map && typeof map.keys === "function") {
      return Array.from(map.keys());
    }
    return Object.keys(map || {});
  }

  // 無制限盤の配置可否（隣接1つ以上＋接する全辺で色一致 / スタートは全色可）
  function canPlaceDynamic(map, row, col, tile, rotation) {
    if (!tile) {
      return false;
    }
    if (dynHas(map, row, col)) {
      return false;
    }
    var hasNeighbor = false;
    var ok = true;
    EDGE_CHECKS.forEach(function (check) {
      var nr = row + check.dr;
      var nc = col + check.dc;
      var neighbor = dynGet(map, nr, nc);
      if (!neighbor) {
        return;
      }
      hasNeighbor = true;
      if (!edgesConnect(tile, rotation, check.own, neighbor.tile, neighbor.rotation || 0, check.other)) {
        ok = false;
      }
    });
    return ok && hasNeighbor;
  }

  function explainPlaceDynamic(map, row, col, tile, rotation) {
    if (!tile) {
      return { ok: false, reasons: ["タイルが選ばれていません"] };
    }
    if (dynHas(map, row, col)) {
      return { ok: false, reasons: ["そのマスは既に埋まっています"] };
    }
    var reasons = [];
    var hasNeighbor = false;
    var ok = true;
    EDGE_CHECKS.forEach(function (check) {
      var neighbor = dynGet(map, row + check.dr, col + check.dc);
      if (!neighbor) {
        return;
      }
      hasNeighbor = true;
      if (isStart(tile) || isStart(neighbor.tile)) {
        reasons.push(check.label + ": スタート＝全色OK");
        return;
      }
      var ownColor = getTriangleColor(tile, rotation, DIR_INDEX[check.own]) || "無";
      var otherColor = getTriangleColor(neighbor.tile, neighbor.rotation || 0, DIR_INDEX[check.other]) || "無";
      if (edgesConnect(tile, rotation, check.own, neighbor.tile, neighbor.rotation || 0, check.other)) {
        reasons.push(check.label + ": ○ 一致(" + ownColor + ")");
      } else {
        ok = false;
        reasons.push(check.label + ": × 不一致 自分=" + ownColor + " / 相手=" + otherColor);
      }
    });
    if (!hasNeighbor) {
      reasons.push("隣接タイルが無い（孤立配置は不可）");
    }
    return { ok: ok && hasNeighbor, reasons: reasons };
  }

  // 配置可能な空きマスの座標一覧（隣接かつ少なくとも1つの向きで置ける）
  function placeableSpotsDynamic(map, tile, rotation) {
    var seen = {};
    var spots = [];
    dynKeys(map).forEach(function (k) {
      var p = k.split(",");
      var r = parseInt(p[0], 10);
      var c = parseInt(p[1], 10);
      EDGE_CHECKS.forEach(function (check) {
        var nr = r + check.dr;
        var nc = c + check.dc;
        var key = nr + "," + nc;
        if (seen[key] || dynHas(map, nr, nc)) {
          return;
        }
        seen[key] = true;
        if (!tile) {
          spots.push({ r: nr, c: nc });
        } else if ([0, 90, 180, 270].some(function (rot) {
          return canPlaceDynamic(map, nr, nc, tile, rot);
        })) {
          spots.push({ r: nr, c: nc });
        }
      });
    });
    return spots;
  }

  // 無制限盤の閉じた同色成分検出（5x5版と同じルール、ハテナ無し）
  function detectPatternComponentsDynamic(map, wantOpen) {
    var results = [];

    function triColor(r, c, d) {
      var cell = dynGet(map, r, c);
      if (!cell) {
        return null;
      }
      if (isStart(cell.tile)) {
        var nr = r + DIR_VEC[d][0];
        var nc = c + DIR_VEC[d][1];
        var ncell = dynGet(map, nr, nc);
        if (!ncell || isStart(ncell.tile)) {
          return null;
        }
        return getTriangleColor(ncell.tile, ncell.rotation || 0, DIR_OPP[d]);
      }
      return getTriangleColor(cell.tile, cell.rotation || 0, d);
    }

    var keys = dynKeys(map);

    COLORS.forEach(function (color) {
      var active = new Set();
      var parent = {};
      function find(x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      function union(a, b) {
        parent[find(a)] = find(b);
      }
      function nid(r, c, d) {
        return r + "," + c + "," + d;
      }

      keys.forEach(function (k) {
        var p = k.split(",");
        var r = parseInt(p[0], 10);
        var c = parseInt(p[1], 10);
        for (var d = 0; d < 4; d++) {
          var t = triColor(r, c, d);
          if (t !== null && t === color) {
            var id = nid(r, c, d);
            active.add(id);
            parent[id] = id;
          }
        }
      });

      active.forEach(function (id) {
        var p = id.split(",");
        var r = parseInt(p[0], 10);
        var c = parseInt(p[1], 10);
        var d = parseInt(p[2], 10);
        if (!isStart(dynGet(map, r, c).tile)) {
          DIR_ADJ[d].forEach(function (ad) {
            var aid = nid(r, c, ad);
            if (active.has(aid)) {
              union(id, aid);
            }
          });
        }
        var nr = r + DIR_VEC[d][0];
        var nc = c + DIR_VEC[d][1];
        if (dynHas(map, nr, nc)) {
          var pid = nid(nr, nc, DIR_OPP[d]);
          if (active.has(pid)) {
            union(id, pid);
          }
        }
      });

      var components = new Map();
      active.forEach(function (id) {
        var root = find(id);
        if (!components.has(root)) {
          components.set(root, []);
        }
        components.get(root).push(id);
      });

      components.forEach(function (nodes) {
        var open = false;
        var sumX = 0;
        var sumY = 0;
        var coords = [];
        nodes.forEach(function (id) {
          var p = id.split(",");
          var r = parseInt(p[0], 10);
          var c = parseInt(p[1], 10);
          var d = parseInt(p[2], 10);
          var nr = r + DIR_VEC[d][0];
          var nc = c + DIR_VEC[d][1];
          if (!dynHas(map, nr, nc)) {
            open = true;
          } else if (triColor(nr, nc, DIR_OPP[d]) !== color) {
            open = true;
          }
          var gx = c + TRI_CX[d];
          var gy = r + TRI_CY[d];
          coords.push({ r: r, c: c, d: d, gx: gx, gy: gy, start: isStart(dynGet(map, r, c).tile) });
          sumX += gx;
          sumY += gy;
        });
        if (open !== wantOpen) {
          return;
        }
        var cellSet = {};
        coords.forEach(function (p) {
          cellSet[p.r + "," + p.c] = { r: p.r, c: p.c };
        });
        results.push({
          color: color,
          points: Math.max(1, Math.floor(coords.length / 2)),
          nodeCount: coords.length,
          centerR: sumY / coords.length,
          centerC: sumX / coords.length,
          cells: Object.keys(cellSet).map(function (k) { return cellSet[k]; }),
          triangles: coords.map(function (p) {
            return { r: p.r, c: p.c, d: p.d, start: p.start };
          }),
          key: color + ":" + nodes.slice().sort().join(",")
        });
      });
    });

    return results;
  }

  // 無制限盤の閉じた同色成分検出（5x5版と同じルール、ハテナ無し）
  function detectClosedPatternsDynamic(map) {
    return detectPatternComponentsDynamic(map, false);
  }

  // 無制限盤の開いている同色成分検出。クラシックBTの終了時未完成点に使う。
  function detectOpenPatternsDynamic(map) {
    return detectPatternComponentsDynamic(map, true);
  }

  global.WiggleRules = {
    COLORS: COLORS,
    START_ID: START_ID,
    tileShapes: tileShapes,
    isStart: isStart,
    getTileBaseColor: getTileBaseColor,
    sampleTileColor: sampleTileColor,
    getTriangleColor: getTriangleColor,
    edgesConnect: edgesConnect,
    canPlace: canPlace,
    explainPlace: explainPlace,
    detectClosedPatterns: detectClosedPatterns,
    // ボーダレス（座標無制限）
    canPlaceDynamic: canPlaceDynamic,
    explainPlaceDynamic: explainPlaceDynamic,
    placeableSpotsDynamic: placeableSpotsDynamic,
    detectClosedPatternsDynamic: detectClosedPatternsDynamic,
    detectOpenPatternsDynamic: detectOpenPatternsDynamic
  };
})(typeof window !== "undefined" ? window : this);
