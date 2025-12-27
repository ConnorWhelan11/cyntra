use ai_nav::{NavCorridor, NavMesh, NavMeshQuery, NavPath, Navigator, Vec2};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn grid_mesh(width: usize, height: usize, cell: f32) -> NavMesh {
    let mut tris = Vec::with_capacity(width * height * 2);
    for y in 0..height {
        for x in 0..width {
            let x0 = x as f32 * cell;
            let y0 = y as f32 * cell;
            let x1 = (x + 1) as f32 * cell;
            let y1 = (y + 1) as f32 * cell;

            tris.push([Vec2::new(x0, y0), Vec2::new(x1, y0), Vec2::new(x1, y1)]);
            tris.push([Vec2::new(x0, y0), Vec2::new(x1, y1), Vec2::new(x0, y1)]);
        }
    }
    NavMesh::from_triangles(tris)
}

fn bench_nav_mesh(c: &mut Criterion) {
    let mesh = grid_mesh(64, 64, 1.0);
    let start = Vec2::new(0.1, 0.1);
    let goal = Vec2::new(63.9, 63.9);

    let mut group = c.benchmark_group("ai-nav/navmesh");

    group.bench_function("find_path_alloc", |b| {
        b.iter(|| {
            let path = mesh.find_path(start, goal).expect("path");
            black_box(path.points.len());
        })
    });

    let mut query = NavMeshQuery::default();
    let mut out = NavPath::new(Vec::new());
    group.bench_function("find_path_into_reuse", |b| {
        b.iter(|| {
            mesh.find_path_into(start, goal, &mut query, &mut out)
                .expect("path");
            black_box(out.points.len());
        })
    });

    group.bench_function("corridor_alloc", |b| {
        b.iter(|| {
            let corridor = mesh.corridor(start, goal).expect("corridor");
            black_box(corridor.regions.len());
        })
    });

    let mut out_corridor = NavCorridor {
        regions: Vec::new(),
        portals: Vec::new(),
        corners: Vec::new(),
    };
    group.bench_function("corridor_into_reuse", |b| {
        b.iter(|| {
            mesh.find_corridor_into(start, goal, &mut query, &mut out_corridor)
                .expect("corridor");
            black_box(out_corridor.regions.len());
        })
    });

    group.finish();
}

criterion_group!(benches, bench_nav_mesh);
criterion_main!(benches);

