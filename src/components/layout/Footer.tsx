import React from 'react';
import { Link } from 'react-router-dom';
import { logos } from '@/assets';

const Footer = () => {
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
                <Link to="/explore" className="hover:text-foreground transition-colors">
                  Find Parking
                </Link>
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
                <Link to="/messages" className="hover:text-foreground transition-colors">
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
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;