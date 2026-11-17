import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, TetrahedronGeometry, Vector3, Euler } from 'three';
import { fx } from '../game/fx';

const MAX = 240;

/** 물보라·금빛 입자. fx.burst(...) 로 터뜨린다. */
export function Particles() {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new TetrahedronGeometry(1, 0), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }), []);
  const st = useMemo(
    () => ({
      pos: new Float32Array(MAX * 3),
      vel: new Float32Array(MAX * 3),
      life: new Float32Array(MAX),
      maxLife: new Float32Array(MAX),
      size: new Float32Array(MAX),
      grav: new Float32Array(MAX),
      next: 0,
    }),
    [],
  );

  useEffect(() => {
    const mesh = ref.current;
    const c = new Color();
    fx.burst = (x, y, z, o) => {
      if (!mesh) return;
      c.set(o.color);
      for (let n = 0; n < o.count; n++) {
        const i = st.next++ % MAX;
        const a = Math.random() * Math.PI * 2;
        const sp = o.speed * (0.4 + Math.random() * 0.8);
        st.pos.set([x, y, z], i * 3);
        st.vel.set([Math.cos(a) * sp, o.up * (0.5 + Math.random() * 0.7), Math.sin(a) * sp], i * 3);
        st.maxLife[i] = (o.life ?? 0.9) * (0.7 + Math.random() * 0.5);
        st.life[i] = st.maxLife[i]!;
        st.size[i] = o.size * (0.6 + Math.random() * 0.8);
        st.grav[i] = o.gravity ?? -9.8;
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    return () => {
      fx.burst = () => {};
    };
  }, [st]);

  const m = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const e = useMemo(() => new Euler(), []);
  const v = useMemo(() => new Vector3(), []);
  const s = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(rawDt, 0.05);
    for (let i = 0; i < MAX; i++) {
      if (st.life[i]! <= 0) {
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, m);
        continue;
      }
      st.life[i] = st.life[i]! - dt;
      st.vel[i * 3 + 1] = st.vel[i * 3 + 1]! + st.grav[i]! * dt;
      for (let k = 0; k < 3; k++) st.pos[i * 3 + k] = st.pos[i * 3 + k]! + st.vel[i * 3 + k]! * dt;
      // 물보라는 수면 아래로 내려가면 사라진다
      if (st.grav[i]! < -5 && st.pos[i * 3 + 1]! < -0.05) st.life[i] = 0;
      const k = Math.max(0, st.life[i]! / st.maxLife[i]!);
      const sz = st.size[i]! * (0.3 + 0.7 * k);
      e.set(st.life[i]! * 7, st.life[i]! * 5, 0);
      m.compose(v.set(st.pos[i * 3]!, st.pos[i * 3 + 1]!, st.pos[i * 3 + 2]!), q.setFromEuler(e), s.set(sz, sz, sz));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, MAX]} frustumCulled={false} />;
}
