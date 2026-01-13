// EV Charger types commonly used
export interface EVChargerType {
  id: string;
  name: string;
  description: string;
  chargingSpeed: string;
  iconPath: string; // PNG path in public folder
}

export const evChargerTypes: EVChargerType[] = [
  {
    id: 'tesla_nacs',
    name: 'Tesla / NACS',
    description: 'Tesla proprietary connector (now NACS standard)',
    chargingSpeed: 'Up to 250 kW DC / 11 kW AC',
    iconPath: '/icons/ev/ev-tesla.png',
  },
  {
    id: 'j1772',
    name: 'SAE J1772',
    description: 'Standard Level 1/2 AC charging for non-Tesla vehicles',
    chargingSpeed: 'Up to 19 kW AC',
    iconPath: '/icons/ev/ev-type1-j1772.png',
  },
  {
    id: 'ccs1',
    name: 'CCS1',
    description: 'Combined Charging System for DC fast charging',
    chargingSpeed: 'Up to 350 kW DC',
    iconPath: '/icons/ev/ev-ccs1.png',
  },
];

export const getChargerTypeById = (id: string | null | undefined): EVChargerType | undefined => {
  if (!id) return undefined;
  return evChargerTypes.find(type => type.id === id);
};

export const getChargerDisplayName = (id: string | null | undefined): string => {
  const charger = getChargerTypeById(id);
  return charger?.name || 'Unknown';
};
