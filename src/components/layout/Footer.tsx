import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { logos } from '@/assets';
import { SUPPORT_USER_ID } from '@/hooks/useSupportRole';
import { getCurrentPosition } from '@/lib/geolocation';

const Footer = () => {
  const navigate = useNavigate();
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const handleFindParkingClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isGettingLocation) return;

    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const startParam = now.toISOString();
    const endParam = twoHoursLater.toISOString();

    setIsGettingLocation(true);
    try {
      // Use native geolocation for faster location on iOS
      const position = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      const { latitude, longitude } = position.coords;
      navigate(`/explore?lat=${latitude}&lng=${longitude}&q=Current%20Location&start=${encodeURIComponent(startParam)}&end=${encodeURIComponent(endParam)}`);
    } catch {
      // Fallback to default LA location
      navigate(`/explore?lat=34.0224&lng=-118.2851&q=Los%20Angeles%2C%20CA&start=${encodeURIComponent(startParam)}&end=${encodeURIComponent(endParam)}`);
    } finally {
      setIsGettingLocation(false);
    }
  };
  return (
    <footer className="bg-muted/30 border-t py-12 hidden md:block">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <img src={logos.primary} alt="Parkzy" className="h-8 mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs">
              The easiest way to find and book parking. Join thousands of drivers saving time and money.
            </p>
          </div>

          {/* Drivers */}
          <div>
            <h4 className="font-semibold mb-4">For Drivers</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <button
                  onClick={handleFindParkingClick}
                  disabled={isGettingLocation}
                  className={`hover:text-foreground transition-colors flex items-center gap-1 ${isGettingLocation ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {isGettingLocation && <Loader2 className="h-3 w-3 animate-spin" />}
                  Find Parking
                </button>
              </li>
              <li>
                <Link to="/activity" className="hover:text-foreground transition-colors">
                  My Reservations
                </Link>
              </li>
              <li>
                <Link to="/my-vehicles" className="hover:text-foreground transition-colors">
                  My Vehicles
                </Link>
              </li>
            </ul>
          </div>

          {/* Hosts */}
          <div>
            <h4 className="font-semibold mb-4">For Hosts</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/list-spot" className="hover:text-foreground transition-colors">
                  List Your Spot
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-foreground transition-colors">
                  Manage Listings
                </Link>
              </li>
              <li>
                <Link to="/host-home" className="hover:text-foreground transition-colors">
                  Host Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/docs" className="hover:text-foreground transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to={`/messages?userId=${SUPPORT_USER_ID}`} className="hover:text-foreground transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/profile" className="hover:text-foreground transition-colors">
                  My Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Parkzy. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;