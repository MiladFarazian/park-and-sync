// EV Charger types commonly used in the USA
export interface EVChargerType {
  id: string;
  name: string;
  description: string;
  chargingSpeed: string;
  icon: string; // Emoji representation
}

export const evChargerTypes: EVChargerType[] = [
  {
    id: 'tesla_nacs',
    name: 'Tesla / NACS',
    description: 'Tesla proprietary connector (now NACS standard)',
    chargingSpeed: 'Up to 250 kW DC / 11 kW AC',
    icon: '⚡',
  },
  {
    id: 'j1772',
    name: 'J1772 (Type 1)',
    description: 'Standard Level 1/2 AC charging for non-Tesla vehicles',
    chargingSpeed: 'Up to 19 kW AC',
    icon: '🔌',
  },
  {
    id: 'ccs1',
    name: 'CCS1 (Combo)',
    description: 'Combined Charging System for DC fast charging',
    chargingSpeed: 'Up to 350 kW DC',
    icon: '⚡',
  },
  {
    id: 'chademo',
    name: 'CHAdeMO',
    description: 'DC fast charging (Nissan, older Mitsubishi)',
    chargingSpeed: 'Up to 100 kW DC',
    icon: '🔋',
  },
  {
    id: 'nema_14_50',
    name: 'NEMA 14-50 Outlet',
    description: '240V outlet - bring your own mobile charger',
    chargingSpeed: 'Up to 9.6 kW AC',
    icon: '🔌',
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
