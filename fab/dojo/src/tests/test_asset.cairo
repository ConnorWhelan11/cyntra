//! Asset model and registry tests

use glia_fab_world::models::asset::{Asset, AssetCategory, QualityTier, Vec3, Quat};

#[test]
fn test_vec3_default() {
    let v: Vec3 = Default::default();
    assert(v.x == 0, 'x should be 0');
    assert(v.y == 0, 'y should be 0');
    assert(v.z == 0, 'z should be 0');
}

#[test]
fn test_quat_default() {
    let q: Quat = Default::default();
    assert(q.x == 0, 'x should be 0');
    assert(q.y == 0, 'y should be 0');
    assert(q.z == 0, 'z should be 0');
    assert(q.w == 1000000000000000000, 'w should be 1.0 fixed-point');
}

#[test]
fn test_vec3_into() {
    let tuple: (i128, i128, i128) = (100, 200, 300);
    let v: Vec3 = tuple.into();
    assert(v.x == 100, 'x should be 100');
    assert(v.y == 200, 'y should be 200');
    assert(v.z == 300, 'z should be 300');
}

#[test]
fn test_quality_tier_equality() {
    let tier1 = QualityTier::Verified;
    let tier2 = QualityTier::Verified;
    let tier3 = QualityTier::Standard;

    assert(tier1 == tier2, 'Same tiers should be equal');
    assert(tier1 != tier3, 'Different tiers should not be equal');
}

#[test]
fn test_asset_category_equality() {
    let cat1 = AssetCategory::Character;
    let cat2 = AssetCategory::Character;
    let cat3 = AssetCategory::Prop;

    assert(cat1 == cat2, 'Same categories should be equal');
    assert(cat1 != cat3, 'Different categories should not be equal');
}
