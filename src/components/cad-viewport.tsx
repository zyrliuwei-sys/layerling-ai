import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type CadPart = {
  name: 'body' | 'lid';
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
};

type PartName = CadPart['name'];
export type CadCameraView = 'iso' | 'top' | 'front';

const viewDirections: Record<CadCameraView, Vector3> = {
  iso: new Vector3(1.35, -1.65, 1.1),
  top: new Vector3(0, -0.001, 1),
  front: new Vector3(0, -1, 0),
};

type ViewportEngine = {
  setParts: (parts: readonly CadPart[]) => void;
  setSelection: (part: PartName | null) => void;
  view: (direction: CadCameraView) => void;
};

export function CadViewport({
  parts,
  selected,
  onSelect,
  view,
  label,
  unsupported,
}: {
  parts: readonly CadPart[];
  selected: PartName | null;
  onSelect: (part: PartName | null) => void;
  view: { direction: CadCameraView; revision: number };
  label: string;
  unsupported: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ViewportEngine>(null);
  const onSelectRef = useRef(onSelect);
  const [isUnsupported, setIsUnsupported] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setIsUnsupported(true);
      return;
    }

    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(canvas);

    const scene = new Scene();
    const model = new Group();
    scene.add(model);
    scene.add(new AmbientLight(0xe4eef6, 2.05));
    const sun = new DirectionalLight(0xffffff, 3.05);
    sun.position.set(-140, -110, 165);
    scene.add(sun);
    const fill = new DirectionalLight(0xaec4d5, 1.4);
    fill.position.set(100, 160, 82);
    scene.add(fill);

    const grid = new GridHelper(1000, 100, 0x576477, 0x445165);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.15;
    scene.add(grid);

    const camera = new PerspectiveCamera(34, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.13;
    controls.maxDistance = 3000;
    controls.minDistance = 3;
    controls.screenSpacePanning = true;

    const raycaster = new Raycaster();
    const start = new Vector2();
    const pointer = new Vector2();
    const onPointerDown = (event: PointerEvent) => {
      start.set(event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        start.distanceTo(pointer.set(event.clientX, event.clientY)) > 4
      ) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2
      );
      raycaster.setFromCamera(pointer, camera);
      const part = raycaster.intersectObjects(model.children, false)[0]?.object;
      onSelectRef.current((part?.name as PartName | undefined) ?? null);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    let hasModel = false;
    let needsRender = true;
    controls.addEventListener('change', () => {
      needsRender = true;
    });
    let selection: PartName | null = null;
    let direction: CadCameraView = 'iso';

    function frameView(next: CadCameraView) {
      direction = next;
      needsRender = true;
      const sphere = new Box3()
        .setFromObject(model)
        .getBoundingSphere(new Sphere());
      const radius = Math.max(23, sphere.radius);
      const field = Math.atan(
        Math.tan((camera.fov * Math.PI) / 360) * Math.min(camera.aspect, 1)
      );
      const distance = (radius / Math.sin(field)) * 1.16;
      controls.target.copy(sphere.center);
      camera.position
        .copy(viewDirections[next])
        .normalize()
        .multiplyScalar(distance)
        .add(controls.target);
      controls.update();
    }

    function setSelection(next: PartName | null) {
      selection = next;
      needsRender = true;
      for (const child of model.children) {
        const { material, name } = child as Mesh<
          BufferGeometry,
          MeshStandardMaterial
        >;
        const color =
          name === next ? 0xd4eb73 : name === 'lid' ? 0xa7ac78 : 0x8797a8;
        material.color.setHex(color);
        material.emissive.setHex(name === next ? 0x303715 : 0x000000);
      }
    }

    function clearModel() {
      for (const child of [...model.children]) {
        const mesh = child as Mesh<BufferGeometry, MeshStandardMaterial>;
        mesh.geometry.dispose();
        mesh.material.dispose();
        model.remove(child);
      }
    }

    function setParts(next: readonly CadPart[]) {
      clearModel();
      for (const part of next) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new BufferAttribute(part.vertices, 3)
        );
        if (part.normals.length === part.vertices.length) {
          geometry.setAttribute('normal', new BufferAttribute(part.normals, 3));
        }
        geometry.setIndex(new BufferAttribute(part.triangles, 1));
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const material = new MeshStandardMaterial({
          roughness: 0.72,
          metalness: 0.04,
          side: DoubleSide,
        });
        const mesh = new Mesh(geometry, material);
        mesh.name = part.name;
        model.add(mesh);
      }
      const body = model.getObjectByName('body');
      const lid = model.getObjectByName('lid');
      if (body && lid) {
        // Show the two print-space meshes as an exploded assembly in the viewport.
        const bodyBounds = new Box3().setFromObject(body);
        const lidBounds = new Box3().setFromObject(lid);
        const gap = Math.max(8, (bodyBounds.max.z - bodyBounds.min.z) * 0.67);
        lid.position.z = bodyBounds.max.z + gap - lidBounds.min.z;
      }
      setSelection(selection);
      if (!hasModel) frameView(direction);
      hasModel = next.length > 0;
    }

    const size = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      needsRender = true;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
      if (!hasModel) frameView(direction);
    });
    size.observe(container);
    frameView('iso');

    const slots = { setParts, setSelection, view: frameView };
    engine.current = slots;
    renderer.setAnimationLoop(() => {
      if (controls.update() || needsRender) {
        renderer.render(scene, camera);
        needsRender = false;
      }
    });

    return () => {
      size.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      clearModel();
      grid.dispose();
      renderer.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.remove();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setParts(parts);
  }, [parts]);

  useEffect(() => {
    engine.current?.setSelection(selected);
  }, [selected]);

  useEffect(() => {
    engine.current?.view(view.direction);
  }, [view]);

  return (
    <div
      className="cad-viewport-canvas"
      ref={host}
      role="img"
      aria-label={label}
    >
      {isUnsupported && (
        <p className="cad-viewport-unsupported">{unsupported}</p>
      )}
    </div>
  );
}
