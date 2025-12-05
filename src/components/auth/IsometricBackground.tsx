import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface SkyscraperProps {
  position: [number, number, number];
  baseHeight: number;
  color: string;
  speed: number;
  phase: number;
}

const Skyscraper = ({ position, baseHeight, color, speed, phase }: SkyscraperProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Animate height oscillation for skyscraper effect
      const heightOffset = Math.sin(state.clock.elapsedTime * speed + phase) * 1.5;
      const currentHeight = baseHeight + heightOffset;
      meshRef.current.scale.y = Math.max(0.5, currentHeight);
      meshRef.current.position.y = (Math.max(0.5, currentHeight) / 2) - 2;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color={color} 
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
};

const Scene = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  const skyscrapers = useMemo(() => {
    const buildings: SkyscraperProps[] = [];
    const gridSize = 8;
    const colors = ['#8b7dd8', '#9d8fe8', '#7c6dc8', '#a99df8', '#8070d0', '#9585e0', '#b5a9ff', '#7a6bc0'];
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        // No spacing - cubes are 1 unit wide, placed 1 unit apart
        const posX = (x - gridSize / 2) * 1;
        const posZ = (z - gridSize / 2) * 1;
        
        // Vary base heights for visual interest
        const baseHeight = 2 + Math.random() * 3;
        
        // Different speeds and phases for wave effect
        const speed = 0.3 + Math.random() * 0.4;
        const phase = (x + z) * 0.5 + Math.random() * 2;
        
        // Pick color based on position for gradient effect
        const colorIndex = Math.floor((x + z) % colors.length);
        
        buildings.push({
          position: [posX, 0, posZ] as [number, number, number],
          baseHeight,
          color: colors[colorIndex],
          speed,
          phase,
        });
      }
    }
    
    return buildings;
  }, []);

  return (
    <group ref={groupRef} rotation={[-0.6, 0.7, 0]}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} color="#c4b5fd" />
      
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
        camera={{ position: [0, 8, 12], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};

export default IsometricBackground;
