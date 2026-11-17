// Module entry: picks the view (factory or office), then starts the shared stage with that scene.
import * as THREE from 'three';
import { OFFICE } from './view.js';
import './hud.js';
import { startApp } from './stage.js';
import { buildScene } from '../factory/index.js';
import { buildOffice } from '../office/index.js';

const APP = {
  frustum: 30, exposure: .95, orbitSpeed: .3, minPolar: .45, maxPolar: 1.2, minZoom: .18, maxZoom: 5,
  home: { target: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(30, 30, 30), zoom: .45 }, // true iso; refit by scene home()
  intro: { pos: new THREE.Vector3(-46, 30, 40), target: new THREE.Vector3(-8, 0, 0), zoom: 1.2, dur: 3.8 },
  bloom: { strength: .45, radius: .4, threshold: 1.05 }, vignette: { offset: 1.05, darkness: .8 },
};
// the office scene gets the camera frustum (its desk view fits to it); maxZoom is high for the view from a desk
if (OFFICE) startApp(ctx => buildOffice(ctx, { frustum: APP.frustum }), { ...APP, minZoom: .04, maxZoom: 48 });
else startApp(buildScene, APP);
