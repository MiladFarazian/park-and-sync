// Vehicle size definitions with examples for user clarity
export interface VehicleSizeInfo {
  value: string;
  label: string;
  shortLabel: string;
  examples: string;
  description: string;
}

export const vehicleSizes: VehicleSizeInfo[] = [
  {
    value: 'compact',
    label: 'Compact',
    shortLabel: 'Compact',
    examples: 'Honda Civic, Toyota Corolla, Mini Cooper, VW Golf',
    description: 'Small cars with length under 15 feet',
  },
  {
    value: 'midsize',
    label: 'Midsize / Sedan',
    shortLabel: 'Sedan',
    examples: 'Toyota Camry, Honda Accord, Tesla Model 3, BMW 3 Series',
    description: 'Standard sedans and mid-size vehicles',
  },
  {
    value: 'suv',
    label: 'SUV / Crossover',
    shortLabel: 'SUV',
    examples: 'Toyota RAV4, Honda CR-V, Ford Explorer, Tesla Model Y',
    description: 'Sport utility vehicles and crossovers',
  },
  {
    value: 'truck',
    label: 'Large SUV / Truck',
    shortLabel: 'Truck',
    examples: 'Chevrolet Suburban, Ford F-150, Toyota Tundra, Cadillac Escalade',
    description: 'Full-size trucks, large SUVs, and vans',
  },
];

export const getVehicleSizeInfo = (value: string): VehicleSizeInfo | undefined => {
  return vehicleSizes.find((size) => size.value === value);
};

export const getVehicleSizeLabel = (value: string): string => {
  const info = getVehicleSizeInfo(value);
  return info?.label || value;
};

export const getVehicleSizeShortLabel = (value: string): string => {
  const info = getVehicleSizeInfo(value);
  return info?.shortLabel || value;
};
