// CAR-LOD config for gen.js. drop = parts left out of the LOD (hidden inside the car / too small to matter at that range),
// raw = parts copied as they are (the procedural proxy wheels), groups = [regex, triangle budget, flags] simplified on their own
// so silhouette parts keep their share, the rest shares what is left. wn / wuv = normal / UV attribute weights.
const HIDDEN = '^(driver_wheel_|wing_rear_mech|floor_plank|misc_rearled_[245]|wheel_.._hub|susp_brake_)';
const WHEELS = '^wheel_.._(tyre|rim|cover|hub|wall)';
const SMALL = '^(driver_belts|misc_antenna|mirror_glass|helmet_main_1)';
module.exports = { lods: [
  { name: 'mid', tris: 14000, wn: 0.5, wuv: 1.5, drop: HIDDEN + '|^proxy_', flags: ['Regularize'],
    groups: [['^(wing_rear|drsflap)', 1100], ['^helmet', 330]] },
  { name: 'far', tris: 6500, wn: 0.4, wuv: 1.0, drop: HIDDEN + '|^proxy_vfar|' + WHEELS + '|' + SMALL, raw: '^proxy_far', flags: ['Regularize'],
    groups: [['^(wing_rear|drsflap)', 520], ['^helmet', 160], ['^wing_front_main', 650]] },
  { name: 'vfar', tris: 1500, wn: 0.2, wuv: 0.5, drop: HIDDEN + '|^proxy_far|' + WHEELS + '|' + SMALL + '|^(misc_|drsflap_sides|body_intake|floor_rearflaps|wing_front_pylons)', raw: '^proxy_vfar', flags: ['Prune', 'Permissive', 'Regularize'],
    groups: [['^(wing_rear|drsflap)', 240], ['^helmet', 60, ['Regularize', 'Permissive']], ['^wing_front', 170, ['Prune', 'Permissive']]] },
] };
