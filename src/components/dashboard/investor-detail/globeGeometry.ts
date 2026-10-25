import * as THREE from "three";

export function latLonToXYZ(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Unit vector perpendicular to `axis`, as close to `preferred` as possible. */
function perpendicularTo(axis: THREE.Vector3, preferred: THREE.Vector3): THREE.Vector3 {
  const out = preferred.clone().projectOnPlane(axis);
  if (out.lengthSq() > 1e-6) return out.normalize();
  const fallback = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  return fallback.cross(axis).normalize();
}

/**
 * Globe rotation that swings a lat/lon around to face the camera wherever the
 * camera has been orbited to, keeping the north pole pointing up on screen.
 */
export function focusQuaternion(lat: number, lon: number, camera: THREE.Camera): THREE.Quaternion {
  const place = new THREE.Vector3(...latLonToXYZ(lat, lon, 1)).normalize();
  const towardCamera = camera.position.clone().normalize();

  // Match the place-and-north frame on the globe to the camera-and-up frame in
  // the world; the rotation between the two bases is the one we want.
  const placeUp = perpendicularTo(place, new THREE.Vector3(0, 1, 0));
  const cameraUp = perpendicularTo(towardCamera, camera.up);
  const from = new THREE.Matrix4().makeBasis(place, placeUp, new THREE.Vector3().crossVectors(place, placeUp));
  const to = new THREE.Matrix4().makeBasis(towardCamera, cameraUp, new THREE.Vector3().crossVectors(towardCamera, cameraUp));

  return new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}
