use ai_nav::{NavMesh, NavMeshQuery, NavPath, NavRegionId, Navigator, Vec2};

fn l_shape_mesh() -> NavMesh {
    NavMesh::from_triangles(vec![
        // Lower-left quad split.
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(3.0, 1.0),
        ],
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(3.0, 1.0),
            Vec2::new(0.0, 1.0),
        ],
        // Upper-right quad split.
        [
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 4.0),
            Vec2::new(3.0, 4.0),
        ],
        [
            Vec2::new(4.0, 0.0),
            Vec2::new(3.0, 4.0),
            Vec2::new(3.0, 1.0),
        ],
    ])
}

fn unit_square_mesh() -> NavMesh {
    NavMesh::from_triangles(vec![
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 1.0),
        ],
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(0.0, 1.0),
        ],
    ])
}

#[test]
fn nav_mesh_funnel_path_avoids_out_of_bounds_shortcut() {
    let mesh = l_shape_mesh();
    assert_eq!(mesh.triangle_count(), 4);

    let start = Vec2::new(0.2, 0.2);
    let goal = Vec2::new(3.8, 3.8);

    // Straight line exits the L-shaped mesh at y=1 around x=1.
    let hit = mesh.raycast(start, goal).expect("expected raycast hit");
    assert!((hit.point.x - 1.0).abs() < 0.05);
    assert!((hit.point.y - 1.0).abs() < 0.05);

    let path = mesh.find_path(start, goal).expect("expected path");
    assert_eq!(path.points.first().copied(), Some(start));
    assert_eq!(path.points.last().copied(), Some(goal));

    let corridor = mesh.corridor(start, goal).expect("expected corridor");
    assert_eq!(corridor.corners, path.points);

    // Allocation-reuse APIs produce identical output.
    let mut query = NavMeshQuery::default();
    let mut into_path = NavPath::new(Vec::new());
    mesh.find_path_into(start, goal, &mut query, &mut into_path)
        .expect("expected into path");
    assert_eq!(into_path.points, path.points);

    // Path should have at least one interior waypoint (it must turn the corner).
    assert!(path.points.len() >= 3);

    // Each segment in the path should remain inside the mesh.
    for w in path.points.windows(2) {
        assert!(
            mesh.raycast(w[0], w[1]).is_none(),
            "segment should stay in-bounds: {:?} -> {:?}",
            w[0],
            w[1]
        );
    }
}

#[test]
fn nav_mesh_nearest_point_projects_outside_points() {
    let mesh = l_shape_mesh();
    let p = Vec2::new(2.0, 2.0); // outside (in the missing square)
    let q = mesh.nearest_point(p).expect("expected projection");
    let d = p.distance(q);
    assert!((d - 1.0).abs() < 1e-3, "unexpected distance: {d}");

    // Projected point should be inside (or on the boundary).
    assert!(mesh.find_triangle(q).is_some());
}

#[test]
fn nav_mesh_corridor_exposes_stable_regions_and_portals() {
    let mesh = unit_square_mesh();

    let start = Vec2::new(0.25, 0.75);
    let goal = Vec2::new(0.75, 0.25);

    let corridor = mesh.corridor(start, goal).expect("expected corridor");
    assert_eq!(corridor.regions, vec![NavRegionId(1), NavRegionId(0)]);
    assert_eq!(corridor.portals.len(), corridor.regions.len());
    assert_eq!(corridor.portals.last().copied(), Some((goal, goal)));
    assert_eq!(corridor.corners.first().copied(), Some(start));
    assert_eq!(corridor.corners.last().copied(), Some(goal));

    let (a, b) = corridor.portals[0];
    let diag0 = Vec2::new(0.0, 0.0);
    let diag1 = Vec2::new(1.0, 1.0);
    assert!(
        (a == diag0 && b == diag1) || (a == diag1 && b == diag0),
        "unexpected portal edge: ({a:?}, {b:?})"
    );
}
