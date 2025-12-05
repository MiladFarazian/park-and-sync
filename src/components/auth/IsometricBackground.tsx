import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface SkyscraperProps {
  position: [number, number, number];
  baseHeight: number;
  speed: number;
  phase: number;
}

const Skyscraper = ({ position, baseHeight, speed, phase }: SkyscraperProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const heightOffset = Math.sin(state.clock.elapsedTime * speed + phase) * 2;
      const currentHeight = baseHeight + heightOffset;
      meshRef.current.scale.y = Math.max(0.5, currentHeight);
      meshRef.current.position.y = Math.max(0.5, currentHeight) / 2;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="#8b5cf6"
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
};

const Scene = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  const skyscrapers = useMemo(() => {
    const buildings: SkyscraperProps[] = [];
    const gridSize = 10;
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const posX = (x - gridSize / 2) * 1;
        const posZ = (z - gridSize / 2) * 1;
        
        const baseHeight = 2 + Math.random() * 4;
        const speed = 0.25 + Math.random() * 0.3;
        const phase = (x * 0.8 + z * 0.8) + Math.random();
        
        buildings.push({
          position: [posX, 0, posZ] as [number, number, number],
          baseHeight,
          speed,
          phase,
        });
      }
    }
    
    return buildings;
  }, []);

  return (
    <group ref={groupRef} rotation={[0, Math.PI / 4, 0]}>
      {/* Key light - creates main shadows and highlights */}
      <directionalLight position={[10, 15, 5]} intensity={1.2} color="#ffffff" />
      
      {/* Fill light - softer, purple tinted */}
      <directionalLight position={[-8, 10, -5]} intensity={0.4} color="#c4b5fd" />
      
      {/* Rim light - adds edge definition */}
      <directionalLight position={[0, 5, -10]} intensity={0.3} color="#a78bfa" />
      
      {/* Ambient for base illumination */}
      <ambientLight intensity={0.3} color="#7c3aed" />
      
      {skyscrapers.map((building, index) => (
        <Skyscraper key={index} {...building} />
      ))}
    </group>
  );
};

const IsometricBackground = () => {
  return (
    <div className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa]" />
      <Canvas
        camera={{ 
          position: [0, 20, 8], 
          fov: 50,
          near: 0.1,
          far: 100
        }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};

export default IsometricBackground;
