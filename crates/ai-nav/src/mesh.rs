use core::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap};

use crate::{NavCorridor, NavPath, NavRaycastHit, NavRegionId, Navigator, Vec2};

#[cfg(feature = "serde")]
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OpenNode {
    f: u32,
    g: u32,
    tri: usize,
    tie: u64,
}

impl OpenNode {
    fn key(&self) -> (u32, u32, usize, u64) {
        (self.f, self.g, self.tri, self.tie)
    }
}

impl Ord for OpenNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering to make BinaryHeap behave like a min-heap.
        other.key().cmp(&self.key())
    }
}

impl PartialOrd for OpenNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Reusable scratch buffers for `NavMesh` queries.
///
/// This avoids per-query allocations in hot paths like `find_path`/`corridor`.
#[derive(Debug, Default)]
pub struct NavMeshQuery {
    open: BinaryHeap<OpenNode>,
    g_score: Vec<u32>,
    came_from: Vec<Option<usize>>,
    poly_path: Vec<usize>,
    portals: Vec<(Vec2, Vec2)>,
}

#[derive(Debug, Clone)]
pub struct NavMesh {
    tris: Vec<[Vec2; 3]>,
    neighbors: Vec<[Option<usize>; 3]>,
    centroids: Vec<Vec2>,
    boundary_edges: Vec<(Vec2, Vec2)>,
}

impl NavMesh {
    /// Build a navmesh from a set of non-overlapping triangles.
    ///
    /// This is a lightweight “baked” representation intended as a stepping stone toward
    /// Recast-style building. Adjacency is inferred from shared edges.
    pub fn from_triangles(tris: Vec<[Vec2; 3]>) -> Self {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct VertexKey(u32, u32);

        impl VertexKey {
            fn from_vec2(p: Vec2) -> Self {
                Self(p.x.to_bits(), p.y.to_bits())
            }
        }

        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct EdgeKey(VertexKey, VertexKey);

        impl EdgeKey {
            fn new(a: Vec2, b: Vec2) -> Self {
                let ka = VertexKey::from_vec2(a);
                let kb = VertexKey::from_vec2(b);
                if ka <= kb {
                    Self(ka, kb)
                } else {
                    Self(kb, ka)
                }
            }
        }

        let mut neighbors = vec![[None; 3]; tris.len()];
        let mut edge_map: BTreeMap<EdgeKey, (usize, usize)> = BTreeMap::new();

        for (tri_idx, tri) in tris.iter().enumerate() {
            for (edge_idx, (a, b)) in tri_edges(tri).into_iter().enumerate() {
                let key = EdgeKey::new(a, b);
                if let Some((other_tri, other_edge)) = edge_map.remove(&key) {
                    neighbors[tri_idx][edge_idx] = Some(other_tri);
                    neighbors[other_tri][other_edge] = Some(tri_idx);
                } else {
                    edge_map.insert(key, (tri_idx, edge_idx));
                }
            }
        }

        let mut boundary_edges = Vec::new();
        for (tri_idx, tri) in tris.iter().enumerate() {
            for (edge_idx, (a, b)) in tri_edges(tri).into_iter().enumerate() {
                if neighbors[tri_idx][edge_idx].is_none() {
                    boundary_edges.push((a, b));
                }
            }
        }

        let centroids = tris.iter().map(|t| tri_centroid(*t)).collect();

        Self {
            tris,
            neighbors,
            centroids,
            boundary_edges,
        }
    }

    pub fn triangle_count(&self) -> usize {
        self.tris.len()
    }

    pub fn triangles(&self) -> &[[Vec2; 3]] {
        &self.tris
    }

    pub fn find_triangle(&self, p: Vec2) -> Option<usize> {
        for (i, tri) in self.tris.iter().enumerate() {
            if point_in_triangle(p, *tri) {
                return Some(i);
            }
        }
        None
    }

    pub fn nearest_point_on_mesh(&self, p: Vec2) -> Option<Vec2> {
        let mut best: Option<(f32, Vec2)> = None;
        for tri in self.tris.iter() {
            let q = closest_point_on_triangle(p, *tri);
            let d2 = (q - p).dot(q - p);
            match best {
                None => best = Some((d2, q)),
                Some((best_d2, _)) if d2 < best_d2 => best = Some((d2, q)),
                _ => {}
            }
        }
        best.map(|(_, q)| q)
    }

    /// Return the first point where the segment from `start` to `end` exits the mesh.
    pub fn raycast_mesh(&self, start: Vec2, end: Vec2) -> Option<NavRaycastHit> {
        // If the start point isn't even on the mesh, treat that as "no raycast".
        if self.find_triangle(start).is_none() {
            return None;
        }

        let dir = end - start;
        let mut best_t: Option<f32> = None;

        for (a, b) in self.boundary_edges.iter().copied() {
            if let Some(t) = segment_intersection_t(start, dir, a, b - a) {
                // Ignore immediate boundary contact at the start point.
                if t <= 1e-6 || t >= 1.0 - 1e-6 {
                    continue;
                }
                if t < 0.0 || t > 1.0 {
                    continue;
                }

                match best_t {
                    None => best_t = Some(t),
                    Some(best) if t < best => best_t = Some(t),
                    _ => {}
                }
            }
        }

        let t = best_t?;
        Some(NavRaycastHit {
            point: start + dir * t,
        })
    }

    pub fn find_poly_path(&self, start: Vec2, goal: Vec2) -> Option<Vec<usize>> {
        let mut query = NavMeshQuery::default();
        let mut out = Vec::new();
        self.find_poly_path_into(start, goal, &mut query, &mut out)?;
        Some(out)
    }

    pub fn find_funnel_path(&self, start: Vec2, goal: Vec2) -> Option<NavPath> {
        let mut query = NavMeshQuery::default();
        let mut out = NavPath::new(Vec::new());
        self.find_path_into(start, goal, &mut query, &mut out)?;
        Some(out)
    }

    pub fn find_corridor(&self, start: Vec2, goal: Vec2) -> Option<NavCorridor> {
        let mut query = NavMeshQuery::default();
        let mut out = NavCorridor {
            regions: Vec::new(),
            portals: Vec::new(),
            corners: Vec::new(),
        };
        self.find_corridor_into(start, goal, &mut query, &mut out)?;
        Some(out)
    }

    pub fn find_poly_path_into(
        &self,
        start: Vec2,
        goal: Vec2,
        query: &mut NavMeshQuery,
        out: &mut Vec<usize>,
    ) -> Option<()> {
        self.find_poly_path_into_scratch(
            start,
            goal,
            &mut query.open,
            &mut query.g_score,
            &mut query.came_from,
            out,
        )
    }

    fn find_poly_path_into_scratch(
        &self,
        start: Vec2,
        goal: Vec2,
        open: &mut BinaryHeap<OpenNode>,
        g_score: &mut Vec<u32>,
        came_from: &mut Vec<Option<usize>>,
        out: &mut Vec<usize>,
    ) -> Option<()> {
        out.clear();

        let start_tri = self.find_triangle(start)?;
        let goal_tri = self.find_triangle(goal)?;
        if start_tri == goal_tri {
            out.push(start_tri);
            return Some(());
        }

        let quant = |d: f32| -> u32 { (d.max(0.0) * 1024.0) as u32 };
        let heuristic = |tri: usize| -> u32 { quant(self.centroids[tri].distance(goal)) };
        let edge_cost = |a: usize, b: usize| -> u32 {
            // Cost between triangle centroids.
            quant(self.centroids[a].distance(self.centroids[b])).saturating_add(1)
        };

        let n = self.tris.len();
        open.clear();
        g_score.resize(n, u32::MAX);
        g_score.fill(u32::MAX);
        came_from.resize(n, None);
        came_from.fill(None);

        g_score[start_tri] = 0;
        open.push(OpenNode {
            f: heuristic(start_tri),
            g: 0,
            tri: start_tri,
            tie: 0,
        });
        let mut tie: u64 = 1;

        while let Some(node) = open.pop() {
            if node.tri == goal_tri {
                out.push(goal_tri);
                let mut current = goal_tri;
                while let Some(prev) = came_from[current] {
                    current = prev;
                    out.push(current);
                }
                out.reverse();
                return Some(());
            }

            if node.g != g_score[node.tri] {
                continue;
            }

            for ntri in self.tri_neighbors(node.tri) {
                let tentative_g = node.g.saturating_add(edge_cost(node.tri, ntri));
                if tentative_g >= g_score[ntri] {
                    continue;
                }

                came_from[ntri] = Some(node.tri);
                g_score[ntri] = tentative_g;
                open.push(OpenNode {
                    f: tentative_g.saturating_add(heuristic(ntri)),
                    g: tentative_g,
                    tri: ntri,
                    tie,
                });
                tie += 1;
            }
        }

        None
    }

    pub fn find_path_into(
        &self,
        start: Vec2,
        goal: Vec2,
        query: &mut NavMeshQuery,
        out: &mut NavPath,
    ) -> Option<()> {
        out.points.clear();

        let (open, g_score, came_from, poly_path, portals) = (
            &mut query.open,
            &mut query.g_score,
            &mut query.came_from,
            &mut query.poly_path,
            &mut query.portals,
        );
        self.find_poly_path_into_scratch(start, goal, open, g_score, came_from, poly_path)?;

        if poly_path.len() <= 1 {
            out.points.push(start);
            out.points.push(goal);
            return Some(());
        }

        portals.clear();
        portals.reserve(poly_path.len());

        for w in poly_path.windows(2) {
            let a = w[0];
            let b = w[1];
            let (p0, p1) = self.shared_edge(a, b)?;
            let c0 = self.centroids[a];
            let dir = self.centroids[b] - c0;
            let s0 = cross(dir, p0 - c0);
            let s1 = cross(dir, p1 - c0);
            let (left, right) = if s0 >= s1 { (p0, p1) } else { (p1, p0) };
            portals.push((left, right));
        }

        portals.push((goal, goal));

        string_pull_into(start, portals, &mut out.points);
        if out.points.last().copied() != Some(goal) {
            out.points.push(goal);
        }

        Some(())
    }

    pub fn find_corridor_into(
        &self,
        start: Vec2,
        goal: Vec2,
        query: &mut NavMeshQuery,
        out: &mut NavCorridor,
    ) -> Option<()> {
        out.regions.clear();
        out.portals.clear();
        out.corners.clear();

        let (open, g_score, came_from, poly_path) = (
            &mut query.open,
            &mut query.g_score,
            &mut query.came_from,
            &mut query.poly_path,
        );
        self.find_poly_path_into_scratch(start, goal, open, g_score, came_from, poly_path)?;
        out.regions.extend(
            poly_path
                .iter()
                .copied()
                .map(|i| NavRegionId(i as u32)),
        );

        if poly_path.len() <= 1 {
            out.portals.push((goal, goal));
            out.corners.push(start);
            out.corners.push(goal);
            return Some(());
        }

        out.portals.reserve(poly_path.len());
        for w in poly_path.windows(2) {
            let a = w[0];
            let b = w[1];
            let (p0, p1) = self.shared_edge(a, b)?;
            let c0 = self.centroids[a];
            let dir = self.centroids[b] - c0;
            let s0 = cross(dir, p0 - c0);
            let s1 = cross(dir, p1 - c0);
            let (left, right) = if s0 >= s1 { (p0, p1) } else { (p1, p0) };
            out.portals.push((left, right));
        }

        out.portals.push((goal, goal));
        string_pull_into(start, &out.portals, &mut out.corners);
        if out.corners.last().copied() != Some(goal) {
            out.corners.push(goal);
        }

        Some(())
    }

    fn tri_neighbors(&self, tri: usize) -> impl Iterator<Item = usize> + '_ {
        // Deterministic order: edge order (0,1), (1,2), (2,0).
        self.neighbors[tri].into_iter().flatten()
    }

    fn shared_edge(&self, from: usize, to: usize) -> Option<(Vec2, Vec2)> {
        let tri = self.tris[from];
        for (edge_idx, (a, b)) in tri_edges(&tri).into_iter().enumerate() {
            if self.neighbors[from][edge_idx] == Some(to) {
                return Some((a, b));
            }
        }
        None
    }
}

#[cfg(feature = "serde")]
#[derive(Serialize, Deserialize)]
struct NavMeshSerde {
    tris: Vec<[Vec2; 3]>,
}

#[cfg(feature = "serde")]
impl Serialize for NavMesh {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        NavMeshSerde {
            tris: self.tris.clone(),
        }
        .serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> Deserialize<'de> for NavMesh {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let data = NavMeshSerde::deserialize(deserializer)?;
        Ok(NavMesh::from_triangles(data.tris))
    }
}

impl Navigator for NavMesh {
    fn find_path(&self, start: Vec2, goal: Vec2) -> Option<NavPath> {
        self.find_funnel_path(start, goal)
    }

    fn corridor(&self, start: Vec2, goal: Vec2) -> Option<NavCorridor> {
        self.find_corridor(start, goal)
    }

    fn raycast(&self, start: Vec2, end: Vec2) -> Option<NavRaycastHit> {
        self.raycast_mesh(start, end)
    }

    fn nearest_point(&self, point: Vec2) -> Option<Vec2> {
        self.nearest_point_on_mesh(point)
    }
}

fn tri_edges(tri: &[Vec2; 3]) -> [(Vec2, Vec2); 3] {
    [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])]
}

fn tri_centroid(tri: [Vec2; 3]) -> Vec2 {
    (tri[0] + tri[1] + tri[2]) / 3.0
}

fn cross(a: Vec2, b: Vec2) -> f32 {
    a.x * b.y - a.y * b.x
}

fn tri_area2(a: Vec2, b: Vec2, c: Vec2) -> f32 {
    cross(b - a, c - a)
}

fn point_in_triangle(p: Vec2, tri: [Vec2; 3]) -> bool {
    let eps = 1e-6;
    let a = tri[0];
    let b = tri[1];
    let c = tri[2];
    let ab = tri_area2(a, b, p);
    let bc = tri_area2(b, c, p);
    let ca = tri_area2(c, a, p);
    let has_neg = ab < -eps || bc < -eps || ca < -eps;
    let has_pos = ab > eps || bc > eps || ca > eps;
    !(has_neg && has_pos)
}

fn closest_point_on_segment(p: Vec2, a: Vec2, b: Vec2) -> Vec2 {
    let ab = b - a;
    let denom = ab.dot(ab);
    if denom <= f32::EPSILON {
        return a;
    }
    let t = (p - a).dot(ab) / denom;
    let t = t.clamp(0.0, 1.0);
    a + ab * t
}

fn closest_point_on_triangle(p: Vec2, tri: [Vec2; 3]) -> Vec2 {
    if point_in_triangle(p, tri) {
        return p;
    }
    let (a, b, c) = (tri[0], tri[1], tri[2]);
    let ab = closest_point_on_segment(p, a, b);
    let bc = closest_point_on_segment(p, b, c);
    let ca = closest_point_on_segment(p, c, a);

    let d_ab = (ab - p).dot(ab - p);
    let d_bc = (bc - p).dot(bc - p);
    let d_ca = (ca - p).dot(ca - p);

    if d_ab <= d_bc && d_ab <= d_ca {
        ab
    } else if d_bc <= d_ca {
        bc
    } else {
        ca
    }
}

// Intersection between segments p + t*r and q + u*s. Returns t if segments intersect.
fn segment_intersection_t(p: Vec2, r: Vec2, q: Vec2, s: Vec2) -> Option<f32> {
    let denom = cross(r, s);
    if denom.abs() <= 1e-8 {
        return None;
    }
    let qp = q - p;
    let t = cross(qp, s) / denom;
    let u = cross(qp, r) / denom;
    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        Some(t)
    } else {
        None
    }
}

fn string_pull_into(start: Vec2, portals: &[(Vec2, Vec2)], out: &mut Vec<Vec2>) {
    out.clear();
    out.push(start);
    if portals.is_empty() {
        return;
    }

    let mut apex = start;
    let mut left = portals[0].0;
    let mut right = portals[0].1;
    let mut left_index: usize = 0;
    let mut right_index: usize = 0;

    let mut i: usize = 1;
    while i < portals.len() {
        let p_left = portals[i].0;
        let p_right = portals[i].1;

        // Update right vertex.
        if tri_area2(apex, right, p_right) <= 0.0 {
            if apex == right || tri_area2(apex, left, p_right) > 0.0 {
                right = p_right;
                right_index = i;
            } else {
                out.push(left);
                apex = left;
                let new_index = left_index;
                left = apex;
                right = apex;
                left_index = new_index;
                right_index = new_index;
                i = new_index + 1;
                continue;
            }
        }

        // Update left vertex.
        if tri_area2(apex, left, p_left) >= 0.0 {
            if apex == left || tri_area2(apex, right, p_left) < 0.0 {
                left = p_left;
                left_index = i;
            } else {
                out.push(right);
                apex = right;
                let new_index = right_index;
                left = apex;
                right = apex;
                left_index = new_index;
                right_index = new_index;
                i = new_index + 1;
                continue;
            }
        }

        i += 1;
    }
}
