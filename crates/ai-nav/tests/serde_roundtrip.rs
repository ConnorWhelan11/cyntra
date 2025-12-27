#![cfg(feature = "serde")]

use ai_nav::{NavMesh, Navigator, Vec2};

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

#[test]
fn nav_mesh_roundtrips_via_serde() {
    let mesh = l_shape_mesh();

    let json = serde_json::to_string(&mesh).expect("serialize navmesh");
    let mesh2: NavMesh = serde_json::from_str(&json).expect("deserialize navmesh");

    assert_eq!(mesh.triangles(), mesh2.triangles());

    let start = Vec2::new(0.2, 0.2);
    let goal = Vec2::new(3.8, 3.8);

    let path1 = mesh.find_path(start, goal).expect("path");
    let path2 = mesh2.find_path(start, goal).expect("path");
    assert_eq!(path1.points, path2.points);

    let c1 = mesh.corridor(start, goal).expect("corridor");
    let c2 = mesh2.corridor(start, goal).expect("corridor");
    assert_eq!(c1.regions, c2.regions);
    assert_eq!(c1.portals, c2.portals);
    assert_eq!(c1.corners, c2.corners);
}
