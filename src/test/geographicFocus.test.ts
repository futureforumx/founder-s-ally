import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { focusQuaternion, latLonToXYZ } from "@/components/dashboard/investor-detail/globeGeometry";

/** Where a lat/lon ends up on screen once the globe has rotated to face the camera. */
function placeAfterFocus(lat: number, lon: number, camera: THREE.Camera) {
  return new THREE.Vector3(...latLonToXYZ(lat, lon, 1))
    .normalize()
    .applyQuaternion(focusQuaternion(lat, lon, camera));
}

function defaultCamera() {
  const camera = new THREE.PerspectiveCamera(40);
  camera.position.set(0, 0, 3.5);
  return camera;
}

describe("focusQuaternion", () => {
  const places: [string, number, number][] = [
    ["Bay Area", 37.77, -122.42],
    ["Boston", 42.36, -71.06],
    ["New York", 40.71, -74.01],
    ["London", 51.51, -0.13],
    ["Tokyo", 35.68, 139.69],
    ["São Paulo", -23.55, -46.63],
    ["Singapore", 1.35, 103.82],
  ];

  it.each(places)("turns %s to face a camera on the z axis", (_name, lat, lon) => {
    const focused = placeAfterFocus(lat, lon, defaultCamera());
    expect(focused.x).toBeCloseTo(0, 5);
    expect(focused.y).toBeCloseTo(0, 5);
    expect(focused.z).toBeCloseTo(1, 5);
  });

  it.each(places)("keeps the north pole pointing up on screen for %s", (_name, lat, lon) => {
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(focusQuaternion(lat, lon, defaultCamera()));
    // Up on screen means no sideways lean, and still above the equator.
    expect(north.x).toBeCloseTo(0, 5);
    expect(north.y).toBeGreaterThan(0);
  });

  it("follows the camera after the user orbits the globe", () => {
    const orbited = new THREE.PerspectiveCamera(40);
    orbited.position.set(3.5, 0, 0);

    const focused = placeAfterFocus(51.51, -0.13, orbited);

    expect(focused.x).toBeCloseTo(1, 5);
    expect(focused.y).toBeCloseTo(0, 5);
    expect(focused.z).toBeCloseTo(0, 5);
  });

  it("stays upright for a place directly under the camera", () => {
    const overhead = new THREE.PerspectiveCamera(40);
    overhead.position.set(0, 3.5, 0);

    const quaternion = focusQuaternion(90, 0, overhead);

    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).y).toBeCloseTo(1, 5);
  });
});
