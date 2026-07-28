'use strict';

W.GameMap = {
  sector: 1,
  maelstrom: -1, // column position of the storm front; nodes at col <= maelstrom are swallowed
  nodes: [],
  curr: 0,

  gen(sector) {
    this.sector = sector;
    this.maelstrom = -1;
    this.nodes = [];
    this.trail = [];
    let id = 0;
    const colNodes = [];
    for (let c = 0; c <= 4; c++) {
      const count = (c === 0 || c === 4) ? 1 : 3;
      const arr = [];
      for (let r = 0; r < count; r++) {
        const node = {
          id: id++, col: c, row: count === 1 ? 1 : r,
          x: 80 + c * 220 + W.randi(-14, 14),
          y: count === 1 ? 205 + W.randi(-25, 25) : 75 + r * 130 + W.randi(-18, 18),
          type: 'empty', edges: [], visited: false,
        };
        arr.push(node);
        this.nodes.push(node);
      }
      colNodes.push(arr);
    }
    this.curr = colNodes[0][0].id;
    this.trail = [this.curr];
    colNodes[0][0].type = 'start';
    colNodes[0][0].visited = true;
    colNodes[4][0].type = sector === 3 ? 'boss' : 'exit';

    const bag = ['combat', 'combat', 'combat', 'combat', 'event', 'event', 'event',
      'distress', 'store', 'empty'];
    for (let c = 1; c <= 3; c++) for (const n of colNodes[c]) n.type = W.pick(bag);
    if (!this.nodes.some(n => n.type === 'store')) {
      W.pick(this.nodes.filter(n => n.col >= 1 && n.col <= 3)).type = 'store';
    }

    const link = (a, b) => {
      if (!a.edges.includes(b.id)) a.edges.push(b.id);
      if (!b.edges.includes(a.id)) b.edges.push(a.id);
    };
    for (let c = 0; c < 4; c++) {
      for (const a of colNodes[c]) {
        for (const b of colNodes[c + 1]) {
          if (colNodes[c].length === 1 || colNodes[c + 1].length === 1 || Math.abs(a.row - b.row) <= 1) {
            link(a, b);
          }
        }
      }
    }
    // neighbors in the same column are sailable too (costs a jump like any other)
    for (let c = 1; c <= 3; c++) {
      for (let r = 0; r < colNodes[c].length - 1; r++) {
        link(colNodes[c][r], colNodes[c][r + 1]);
      }
    }
  },

  node(id) { return this.nodes.find(n => n.id === id); },
  canJump(id) { return this.node(this.curr).edges.includes(id); },
  stormed(n) { return n.col <= this.maelstrom; },

  jump(id) {
    this.curr = id;
    (this.trail = this.trail || []).push(id);
    this.maelstrom += 0.65;
    const n = this.node(id);
    const first = !n.visited;
    n.visited = true;
    return { node: n, stormed: this.stormed(n), first };
  },
};
