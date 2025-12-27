use crate::{NavPath, Navigator, Vec2};
use core::cmp::Ordering;
use std::collections::BinaryHeap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct Cell {
    x: i32,
    y: i32,
}

#[derive(Debug)]
struct OpenNode {
    f: u32,
    g: u32,
    cell: Cell,
    tie: u64,
}

impl OpenNode {
    fn key(&self) -> (u32, u32, Cell, u64) {
        (self.f, self.g, self.cell, self.tie)
    }
}

impl PartialEq for OpenNode {
    fn eq(&self, other: &Self) -> bool {
        self.key() == other.key()
    }
}

impl Eq for OpenNode {}

impl PartialOrd for OpenNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for OpenNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering to make BinaryHeap behave like a min-heap.
        other.key().cmp(&self.key())
    }
}

#[derive(Debug, Clone)]
pub struct NavGrid {
    width: i32,
    height: i32,
    cell_size: f32,
    blocked: Vec<bool>,
}

impl NavGrid {
    pub fn new(width: u32, height: u32, cell_size: f32) -> Self {
        assert!(width > 0 && height > 0, "grid must be non-empty");
        assert!(cell_size > 0.0, "cell_size must be > 0");
        let width = width as i32;
        let height = height as i32;
        Self {
            width,
            height,
            cell_size,
            blocked: vec![false; (width * height) as usize],
        }
    }

    pub fn cell_size(&self) -> f32 {
        self.cell_size
    }

    pub fn set_blocked(&mut self, x: i32, y: i32, blocked: bool) {
        if let Some(idx) = self.idx(Cell { x, y }) {
            self.blocked[idx] = blocked;
        }
    }

    pub fn is_blocked(&self, x: i32, y: i32) -> bool {
        self.idx(Cell { x, y })
            .map(|idx| self.blocked[idx])
            .unwrap_or(true)
    }

    fn in_bounds(&self, cell: Cell) -> bool {
        cell.x >= 0 && cell.y >= 0 && cell.x < self.width && cell.y < self.height
    }

    fn idx(&self, cell: Cell) -> Option<usize> {
        if !self.in_bounds(cell) {
            return None;
        }
        Some((cell.y * self.width + cell.x) as usize)
    }

    fn world_to_cell(&self, p: Vec2) -> Option<Cell> {
        let x = (p.x / self.cell_size).floor() as i32;
        let y = (p.y / self.cell_size).floor() as i32;
        let cell = Cell { x, y };
        if self.in_bounds(cell) {
            Some(cell)
        } else {
            None
        }
    }

    fn cell_center(&self, cell: Cell) -> Vec2 {
        Vec2::new(
            (cell.x as f32 + 0.5) * self.cell_size,
            (cell.y as f32 + 0.5) * self.cell_size,
        )
    }

    fn heuristic(&self, a: Cell, b: Cell) -> u32 {
        ((a.x - b.x).abs() + (a.y - b.y).abs()) as u32
    }

    fn neighbors(&self, cell: Cell) -> [Cell; 4] {
        // Fixed order for determinism: N, E, S, W.
        [
            Cell {
                x: cell.x,
                y: cell.y - 1,
            },
            Cell {
                x: cell.x + 1,
                y: cell.y,
            },
            Cell {
                x: cell.x,
                y: cell.y + 1,
            },
            Cell {
                x: cell.x - 1,
                y: cell.y,
            },
        ]
    }

    fn reconstruct_path(&self, came_from: &[Option<usize>], mut current: usize) -> Vec<usize> {
        let mut out = vec![current];
        while let Some(prev) = came_from[current] {
            current = prev;
            out.push(current);
        }
        out.reverse();
        out
    }

    fn cell_from_idx(&self, idx: usize) -> Cell {
        let idx = idx as i32;
        let x = idx % self.width;
        let y = idx / self.width;
        Cell { x, y }
    }

    fn a_star(&self, start: Cell, goal: Cell) -> Option<Vec<Cell>> {
        let start_idx = self.idx(start)?;
        let goal_idx = self.idx(goal)?;
        if self.blocked[start_idx] || self.blocked[goal_idx] {
            return None;
        }

        let mut open = BinaryHeap::<OpenNode>::new();
        let mut tie: u64 = 0;

        let grid_len = (self.width * self.height) as usize;
        let mut g_score = vec![u32::MAX; grid_len];
        let mut came_from: Vec<Option<usize>> = vec![None; grid_len];

        g_score[start_idx] = 0;
        let h0 = self.heuristic(start, goal);
        open.push(OpenNode {
            f: h0,
            g: 0,
            cell: start,
            tie,
        });
        tie += 1;

        while let Some(node) = open.pop() {
            if node.cell == goal {
                let idx_path = self.reconstruct_path(&came_from, goal_idx);
                return Some(idx_path.into_iter().map(|i| self.cell_from_idx(i)).collect());
            }

            let node_idx = self.idx(node.cell)?;
            if node.g != g_score[node_idx] {
                // Stale heap entry.
                continue;
            }

            for n in self.neighbors(node.cell) {
                let Some(n_idx) = self.idx(n) else { continue };
                if self.blocked[n_idx] {
                    continue;
                }

                let tentative_g = node.g.saturating_add(1);
                if tentative_g >= g_score[n_idx] {
                    continue;
                }

                came_from[n_idx] = Some(node_idx);
                g_score[n_idx] = tentative_g;
                let h = self.heuristic(n, goal);
                open.push(OpenNode {
                    f: tentative_g.saturating_add(h),
                    g: tentative_g,
                    cell: n,
                    tie,
                });
                tie += 1;
            }
        }

        None
    }
}

impl Navigator for NavGrid {
    fn find_path(&self, start: Vec2, goal: Vec2) -> Option<NavPath> {
        let start_cell = self.world_to_cell(start)?;
        let goal_cell = self.world_to_cell(goal)?;
        let cells = self.a_star(start_cell, goal_cell)?;

        // Convert to points. Preserve exact endpoints for nicer movement.
        let inner_len = cells.len().saturating_sub(2);
        let mut points = Vec::with_capacity(cells.len().saturating_add(1));
        points.push(start);

        if cells.len() >= 2 {
            for cell in cells.into_iter().skip(1).take(inner_len) {
                points.push(self.cell_center(cell));
            }
        }

        points.push(goal);
        Some(NavPath::new(points))
    }
}
