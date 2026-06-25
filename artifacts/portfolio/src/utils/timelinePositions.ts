import * as THREE from "three";

const WORK_X_LEFT = -1.5;
const WORK_X_RIGHT = 1.5;
const WORK_Z_STEP = -1.1;

const EDU_X_LEFT = -1.5;
const EDU_X_RIGHT = 1.5;
const EDU_Z_START = -14.2;
const EDU_Z_STEP = -1.1;

const Y_PATTERN = [0, 0.3, 0.6, 0.2, 0.5, 0.4, 0.6, 0.3, 0.5, 0.6, 0.4];

export const calcWorkPosition = (index: number, position: "left" | "right"): THREE.Vector3 => {
  const x = position === "left" ? WORK_X_LEFT : WORK_X_RIGHT;
  const y = Y_PATTERN[index % Y_PATTERN.length] ?? 0.4;
  const z = index * WORK_Z_STEP;
  return new THREE.Vector3(x, y, z);
};

export const calcEducationPosition = (index: number, position: "left" | "right"): THREE.Vector3 => {
  const x = position === "left" ? EDU_X_LEFT : EDU_X_RIGHT;
  const y = Y_PATTERN[index % Y_PATTERN.length] ?? 0.4;
  const z = EDU_Z_START + index * EDU_Z_STEP;
  return new THREE.Vector3(x, y, z);
};
