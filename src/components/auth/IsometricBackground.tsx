import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface FloatingBoxProps {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  speed: number;
  rotationOffset: number;
}

const FloatingBox = ({ position, size, color, speed, rotationOffset }: FloatingBoxProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const initialY = position[1];
  
  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      meshRef.current.position.y = initialY + Math.sin(state.clock.elapsedTime * speed + rotationOffset) * 0.3;
      // Subtle rotation
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3 + rotationOffset) * 0.1 - 0.2;
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2 + rotationOffset) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-0.2, 0.5, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={0.85}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  );
};

const Scene = () => {
  const boxes = useMemo(() => [
    // Layer 1 - Back
    { position: [-3, 2, -4] as [number, number, number], size: [4, 0.3, 3] as [number, number, number], color: '#8b7dd8', speed: 0.4, rotationOffset: 0 },
    { position: [2, 2.5, -5] as [number, number, number], size: [3.5, 0.3, 2.5] as [number, number, number], color: '#9d8fe8', speed: 0.35, rotationOffset: 1 },
    { position: [-1, 3.5, -6] as [number, number, number], size: [5, 0.3, 3] as [number, number, number], color: '#7c6dc8', speed: 0.45, rotationOffset: 2 },
    
    // Layer 2 - Middle
    { position: [-2.5, 0.5, -2] as [number, number, number], size: [3.5, 0.3, 2.5] as [number, number, number], color: '#a99df8', speed: 0.5, rotationOffset: 0.5 },
    { position: [1.5, 1, -3] as [number, number, number], size: [4, 0.3, 3] as [number, number, number], color: '#8070d0', speed: 0.4, rotationOffset: 1.5 },
    { position: [-0.5, 0, -2.5] as [number, number, number], size: [3, 0.3, 2] as [number, number, number], color: '#9585e0', speed: 0.55, rotationOffset: 2.5 },
    
    // Layer 3 - Front
    { position: [-3, -1.5, 0] as [number, number, number], size: [3.5, 0.3, 2.5] as [number, number, number], color: '#b5a9ff', speed: 0.45, rotationOffset: 0.8 },
    { position: [2, -1, -1] as [number, number, number], size: [4, 0.3, 3] as [number, number, number], color: '#8b7dd8', speed: 0.5, rotationOffset: 1.8 },
    { position: [0, -2, 1] as [number, number, number], size: [5, 0.3, 3.5] as [number, number, number], color: '#9d8fe8', speed: 0.4, rotationOffset: 2.8 },
    
    // Additional scattered boxes
    { position: [3.5, 0, -4] as [number, number, number], size: [2.5, 0.25, 2] as [number, number, number], color: '#a99df8', speed: 0.35, rotationOffset: 3.2 },
    { position: [-4, 1, -3] as [number, number, number], size: [3, 0.25, 2] as [number, number, number], color: '#7c6dc8', speed: 0.5, rotationOffset: 3.8 },
    { position: [0.5, 3, -4.5] as [number, number, number], size: [3.5, 0.3, 2.5] as [number, number, number], color: '#8070d0', speed: 0.42, rotationOffset: 4.2 },
  ], []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#c4b5fd" />
      
      {boxes.map((box, index) => (
        <FloatingBox key={index} {...box} />
      ))}
    </>
  );
};

const IsometricBackground = () => {
  return (
    <div className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa]" />
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};

export default IsometricBackground;
