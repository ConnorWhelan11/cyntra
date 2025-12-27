use ai_nav::{NavGrid, Navigator, Vec2};

#[test]
fn nav_grid_finds_path_around_blockers() {
    let mut grid = NavGrid::new(5, 5, 1.0);

    // Block a vertical wall with a single gap.
    for y in 0..5 {
        if y == 2 {
            continue;
        }
        grid.set_blocked(2, y, true);
    }

    let start = Vec2::new(0.5, 0.5);
    let goal = Vec2::new(4.5, 4.5);
    let path = grid.find_path(start, goal).expect("path should exist");

    assert_eq!(path.points.first().copied(), Some(start));
    assert_eq!(path.points.last().copied(), Some(goal));
    assert!(path.points.len() >= 2);
}

#[test]
fn nav_grid_is_deterministic_for_same_input() {
    let mut grid = NavGrid::new(10, 10, 1.0);
    for y in 0..10 {
        grid.set_blocked(5, y, true);
    }
    grid.set_blocked(5, 5, false);

    let start = Vec2::new(1.5, 1.5);
    let goal = Vec2::new(8.5, 8.5);

    let a = grid.find_path(start, goal).expect("path should exist");
    let b = grid.find_path(start, goal).expect("path should exist");

    assert_eq!(a.points, b.points);
}

