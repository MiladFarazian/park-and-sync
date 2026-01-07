import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Shield, Camera, MapPin, DollarSign, Trash2, Upload, Star, CheckCircle2, ChevronLeft, ChevronRight, Save, Zap, GripVertical, Clock, Car, Lightbulb, CalendarDays, BoltIcon, Accessibility } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
const spotCategories = [
  'Residential Driveway',
  'Apartment / Condo Lot',
  'Commercial Lot',
  'Garage',
  'Street Parking',
  'Event / Venue Lot',
] as const;

const formSchema = z.object({
  category: z.enum(spotCategories, { required_error: 'Please select a spot type' }),
  address: z.string().min(5, 'Address is required'),
  hourlyRate: z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Hourly rate must be a positive number'
  }),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  accessNotes: z.string().optional(),
  hostRules: z.string().optional(),
  cancellationPolicy: z.string().optional()
});

// Module-level storage for pending uploads (survives component re-renders/remounts)
let globalPendingUploads: File[] = [];
const amenitiesList = [{
  id: 'covered',
  label: 'Covered',
  icon: Shield,
  dbField: 'is_covered'
}, {
  id: 'security',
  label: 'Security Camera',
  icon: Camera,
  dbField: 'is_secure'
}, {
  id: '24-7',
  label: '24/7 Access',
  icon: Clock,
  dbField: null
}, {
  id: 'ev',
  label: 'EV Charging',
  icon: Zap,
  dbField: 'has_ev_charging'
}, {
  id: 'easy',
  label: 'Easy Access',
  icon: Car,
  dbField: null
}, {
  id: 'lit',
  label: 'Well Lit',
  icon: Lightbulb,
  dbField: null
}, {
  id: 'ada',
  label: 'ADA Accessible',
  icon: Accessibility,
  dbField: 'is_ada_accessible'
}];
interface SpotPhoto {
  id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}
interface SortablePhotoProps {
  photo: SpotPhoto;
  index: number;
  isMarkedForDelete: boolean;
  onSetPrimary: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  onUndoDelete: (photoId: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  isFirst: boolean;
  isLast: boolean;
}
const SortablePhoto: React.FC<SortablePhotoProps> = ({
  photo,
  index,
  isMarkedForDelete,
  onSetPrimary,
  onDelete,
  onUndoDelete,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: photo.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  return <div ref={setNodeRef} style={style} className="relative group">
      <div className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${isMarkedForDelete ? 'border-destructive opacity-50' : photo.is_primary ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
        <img src={photo.url} alt="Spot" className="w-full h-full object-cover" />
        
        <Badge variant="secondary" className="absolute top-2 left-2 text-xs font-semibold z-10">
          #{index + 1}
        </Badge>
        
        <button {...attributes} {...listeners} className="absolute top-2 left-12 bg-background/90 hover:bg-background text-foreground p-1.5 rounded-md cursor-grab active:cursor-grabbing z-10 transition-all hover:scale-110" type="button">
          <GripVertical className="h-4 w-4" />
        </button>
        
        {isMarkedForDelete && <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground px-2.5 py-1 rounded-md text-xs font-semibold shadow-lg z-10">
            Will Delete
          </div>}
        
        {photo.is_primary && !isMarkedForDelete && <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-lg z-10">
            <Star className="h-3.5 w-3.5 fill-current" />
            Primary
          </div>}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-2">
          {!photo.is_primary && !isMarkedForDelete && <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="sm" variant="secondary" onClick={() => onSetPrimary(photo.id)} className="shadow-lg">
                  <Star className="h-4 w-4 mr-1.5" />
                  Set Primary
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>This photo will appear first</p>
              </TooltipContent>
            </Tooltip>}
          
          {!isMarkedForDelete && <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="sm" variant="secondary" onClick={onMoveLeft} disabled={isFirst} className="shadow-lg h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move Left</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="sm" variant="secondary" onClick={onMoveRight} disabled={isLast} className="shadow-lg h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move Right</TooltipContent>
              </Tooltip>
            </div>}
          
          <Button type="button" size="sm" variant={isMarkedForDelete ? "secondary" : "destructive"} onClick={() => isMarkedForDelete ? onUndoDelete(photo.id) : onDelete(photo.id)} className="shadow-lg">
            {isMarkedForDelete ? <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Undo Delete
              </> : <>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </>}
          </Button>
        </div>
      </div>
    </div>;
};
interface AddressSuggestion {
  name: string;
  place_formatted: string;
  full_address: string;
  mapbox_id: string;
}
const EditSpot = () => {
  const navigate = useNavigate();
  const {
    spotId
  } = useParams<{
    spotId: string;
  }>();
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [instantBook, setInstantBook] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<SpotPhoto[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [pendingUploads, setPendingUploads] = useState<File[]>([]);
  const [pendingUploadPreviews, setPendingUploadPreviews] = useState<string[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [stagedPhotos, setStagedPhotos] = useState<SpotPhoto[]>([]);
  const [stagedPrimaryId, setStagedPrimaryId] = useState<string | null>(null);
  const [uploadStatuses, setUploadStatuses] = useState<{
    fileName: string;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    progress: number;
  }[]>([]);
  
  // EV Charging state
  const [evChargingInstructions, setEvChargingInstructions] = useState('');
  const [evChargingPremium, setEvChargingPremium] = useState('0');
  
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8
    }
  }), useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }));
  const {
    register,
    handleSubmit,
    setValue,
    formState: {
      errors
    }
  } = useForm({
    resolver: zodResolver(formSchema)
  });
  
  // Clear global uploads when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      globalPendingUploads = [];
    };
  }, []);
  
  useEffect(() => {
    supabase.auth.getUser().then(({
      data: {
        user
      }
    }) => {
      setUser(user);
    });
  }, []);
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      }
    };
    fetchMapboxToken();
  }, []);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#address') && !target.closest('.suggestions-dropdown')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    const fetchSpot = async () => {
      if (!spotId) return;
      try {
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }
        const {
          data: spotData,
          error: spotError
        } = await supabase.from('spots').select('*').eq('id', spotId).single();
        if (spotError) throw spotError;
        if (spotData.host_id !== user.id) {
          toast.error('You do not have permission to edit this spot');
          navigate('/dashboard');
          return;
        }
        setValue('address', spotData.address);
        setValue('hourlyRate', spotData.hourly_rate.toString());
        setValue('description', spotData.description || '');
        setValue('accessNotes', spotData.access_notes || '');
        setValue('hostRules', spotData.host_rules || '');
        setValue('cancellationPolicy', spotData.cancellation_policy || '');
        if (spotData.category) {
          setValue('category', spotData.category as typeof spotCategories[number]);
          setSelectedCategory(spotData.category);
        }
        const amenities = [];
        if (spotData.is_covered) amenities.push('covered');
        if (spotData.is_secure) amenities.push('security');
        if (spotData.has_ev_charging) amenities.push('ev');
        if (spotData.is_ada_accessible) amenities.push('ada');
        setSelectedAmenities(amenities);
        setInstantBook(spotData.instant_book !== false); // Default to true if null/undefined
        
        // Load EV charging settings
        setEvChargingInstructions(spotData.ev_charging_instructions || '');
        setEvChargingPremium(spotData.ev_charging_premium_per_hour?.toString() || '0');
        const {
          data: photosData,
          error: photosError
        } = await supabase.from('spot_photos').select('*').eq('spot_id', spotId).order('sort_order', {
          ascending: true
        });
        if (!photosError && photosData) {
          setExistingPhotos(photosData);
          setStagedPhotos(photosData);
          const primary = photosData.find(p => p.is_primary);
          if (primary) setStagedPrimaryId(primary.id);
        }
      } catch (error) {
        console.error('Error fetching spot:', error);
        toast.error('Failed to load spot details');
        navigate('/dashboard');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSpot();
  }, [spotId, navigate, setValue]);
  const searchAddresses = async (query: string) => {
    if (!mapboxToken || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    try {
      setLoadingSuggestions(true);
      const socal_center = {
        lat: 34.0522,
        lng: -118.2437
      };
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?` + `q=${encodeURIComponent(query)}` + `&access_token=${mapboxToken}` + `&session_token=${sessionTokenRef.current}` + `&limit=8` + `&types=poi,address,place` + `&proximity=${socal_center.lng},${socal_center.lat}` + `&country=US` + `&bbox=-119.5,32.5,-117.0,34.8`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Address search failed');
      const data = await response.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setAddressSuggestions(data.suggestions);
      } else {
        setAddressSuggestions([]);
      }
    } catch (error) {
      console.error('Error searching addresses:', error);
      setAddressSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };
  const handleAddressChange = (value: string) => {
    setValue('address', value);
    if (value.length >= 3) {
      setShowSuggestions(true);
      searchAddresses(value);
    } else {
      setShowSuggestions(false);
      setAddressSuggestions([]);
    }
  };
  const handleSuggestionSelect = async (suggestion: AddressSuggestion) => {
    if (!mapboxToken || !suggestion.mapbox_id) return;
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      const response = await fetch(retrieveUrl);
      const data = await response.json();
      if (data?.features?.[0]?.geometry?.coordinates) {
        const fullAddress = suggestion.full_address || suggestion.name || suggestion.place_formatted;
        setValue('address', fullAddress);
        setShowSuggestions(false);
        setAddressSuggestions([]);
        sessionTokenRef.current = crypto.randomUUID();
      }
    } catch (error) {
      console.error('Error selecting address:', error);
      toast.error('Failed to select address. Please try again.');
    }
  };
  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities(prev => prev.includes(amenityId) ? prev.filter(id => id !== amenityId) : [...prev, amenityId]);
  };
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      e.target.value = '';
      return;
    }
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) {
      toast.error('Please select valid image files');
      e.target.value = '';
      return;
    }
    // Create preview URLs
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));

    // Update global storage (survives component remounts)
    globalPendingUploads = [...globalPendingUploads, ...newFiles];

    // Update state for UI
    setPendingUploads(prev => [...prev, ...newFiles]);
    setPendingUploadPreviews(prev => [...prev, ...newPreviews]);
    toast.success(`${newFiles.length} photo${newFiles.length > 1 ? 's' : ''} ready to upload. Click Save Changes to confirm.`);
    e.target.value = '';
  };
  const stagePhotoDelete = (photoId: string) => {
    setPendingDeletes(prev => new Set(prev).add(photoId));
    setStagedPhotos(prev => prev.filter(p => p.id !== photoId));
    toast.info('Photo marked for deletion. Click Save to confirm.');
  };
  const stagePrimaryPhoto = (photoId: string) => {
    setStagedPrimaryId(photoId);
    setStagedPhotos(prev => prev.map(p => ({
      ...p,
      is_primary: p.id === photoId
    })));
    toast.info('Primary photo updated. Click Save to confirm.');
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (dropped.length === 0) {
      toast.error('Please drop valid image files');
      return;
    }

    // Update global storage (survives component remounts)
    globalPendingUploads = [...globalPendingUploads, ...dropped];

    // Stage files for upload and create preview URLs
    setPendingUploads(prev => [...prev, ...dropped]);
    const newPreviews = dropped.map(file => URL.createObjectURL(file));
    setPendingUploadPreviews(prev => [...prev, ...newPreviews]);
    toast.info(`${dropped.length} photo${dropped.length > 1 ? 's' : ''} selected. Click Save to upload.`);
  };
  const moveStagedPhoto = (index: number, direction: 'left' | 'right') => {
    const newPhotos = [...stagedPhotos];
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= stagedPhotos.length) return;
    [newPhotos[index], newPhotos[newIndex]] = [newPhotos[newIndex], newPhotos[index]];
    setStagedPhotos(newPhotos);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    if (over && active.id !== over.id) {
      setStagedPhotos(photos => {
        const oldIndex = photos.findIndex(p => p.id === active.id);
        const newIndex = photos.findIndex(p => p.id === over.id);
        return arrayMove(photos, oldIndex, newIndex);
      });
      toast.info('Photo order updated. Click Save Changes to confirm.');
    }
  };
  const handleDelete = async () => {
    if (!spotId || isDeleting) return;
    try {
      setIsDeleting(true);
      const {
        data: futureBookings,
        error: bookingsError
      } = await supabase.from('bookings').select('id').eq('spot_id', spotId).gt('end_at', new Date().toISOString()).in('status', ['pending', 'paid']);
      if (bookingsError) throw bookingsError;
      if (futureBookings && futureBookings.length > 0) {
        toast.error('Cannot delete spot with future bookings. Please cancel them first or archive the listing.');
        setShowDeleteDialog(false);
        return;
      }
      await supabase.from('spot_photos').delete().eq('spot_id', spotId);
      await supabase.from('availability_rules').delete().eq('spot_id', spotId);
      const {
        error: deleteError
      } = await supabase.from('spots').delete().eq('id', spotId);
      if (deleteError) throw deleteError;
      toast.success('Listing deleted successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting spot:', error);
      toast.error('Failed to delete listing');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };
  const onSubmit = async (data: any) => {
    // Use global storage as source of truth (survives component remounts)
    const filesToUpload = [...globalPendingUploads];
    
    if (!spotId || isSaving) return;
    
    // Validate EV charging premium if EV is enabled
    const hasEvCharging = selectedAmenities.includes('ev');
    if (hasEvCharging && (!evChargingPremium || parseFloat(evChargingPremium) <= 0)) {
      toast.error('EV charging premium must be greater than $0 when EV charging is enabled');
      return;
    }
    
    try {
      setIsSaving(true);

      // Step 1: Delete photos marked for deletion
      for (const photoId of pendingDeletes) {
        const photo = existingPhotos.find(p => p.id === photoId);
        if (photo) {
          const urlParts = photo.url.split('/');
          const filePath = urlParts.slice(urlParts.indexOf('spot-photos') + 1).join('/');
          await supabase.storage.from('spot-photos').remove([filePath]);
          await supabase.from('spot_photos').delete().eq('id', photoId);
        }
      }

      // Step 2: Upload new photos
      if (filesToUpload.length > 0) {
        setIsUploadingPhotos(true);

        // Initialize upload statuses
        const initialStatuses = filesToUpload.map(file => ({
          fileName: file.name,
          status: 'pending' as const,
          progress: 0
        }));
        setUploadStatuses(initialStatuses);
        toast.info(`Uploading ${filesToUpload.length} photo${filesToUpload.length > 1 ? 's' : ''}...`);
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          try {
            // Update status to uploading
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              status: 'uploading' as const,
              progress: 10
            } : status));
            const compressedFile = await compressImage(file);

            // Update progress after compression
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              progress: 30
            } : status));
            const extFromName = (compressedFile as File).name?.split('.').pop();
            const extFromType = (compressedFile as File).type?.split('/').pop();
            const safeExt = (extFromName || extFromType || 'jpg').toLowerCase().replace('jpeg', 'jpg');
            const uid = (globalThis as any)?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const filePath = `${spotId}/${uid}.${safeExt}`;

            // Update progress before storage upload
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              progress: 50
            } : status));
            const {
              error: uploadError
            } = await supabase.storage.from('spot-photos').upload(filePath, compressedFile);
            if (uploadError) throw uploadError;

            // Update progress after storage upload
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              progress: 80
            } : status));
            const {
              data: {
                publicUrl
              }
            } = supabase.storage.from('spot-photos').getPublicUrl(filePath);
            await supabase.from('spot_photos').insert({
              spot_id: spotId,
              url: publicUrl,
              is_primary: false,
              sort_order: stagedPhotos.length + i
            });

            // Mark as complete
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              status: 'complete' as const,
              progress: 100
            } : status));
          } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            setUploadStatuses(prev => prev.map((status, idx) => idx === i ? {
              ...status,
              status: 'error' as const
            } : status));
            throw error;
          }
          setUploadProgress((i + 1) / filesToUpload.length * 100);
        }
        setIsUploadingPhotos(false);
        setUploadProgress(0);
        setUploadStatuses([]);
        // Clear the global storage after successful upload
        globalPendingUploads = [];
      }

      // Step 3: Update photo order and primary status
      const {
        data: allPhotos
      } = await supabase.from('spot_photos').select('*').eq('spot_id', spotId);
      if (allPhotos) {
        // Update order
        for (let i = 0; i < stagedPhotos.length; i++) {
          await supabase.from('spot_photos').update({
            sort_order: i
          }).eq('id', stagedPhotos[i].id);
        }

        // Update primary photo
        if (stagedPrimaryId) {
          await supabase.from('spot_photos').update({
            is_primary: false
          }).eq('spot_id', spotId);
          await supabase.from('spot_photos').update({
            is_primary: true
          }).eq('id', stagedPrimaryId);
        }
      }

      // Step 4: Update spot details
      const hasEvCharging = selectedAmenities.includes('ev');
      const updateData = {
        category: data.category,
        title: data.category,
        address: data.address,
        hourly_rate: parseFloat(data.hourlyRate),
        description: data.description,
        access_notes: data.accessNotes || null,
        host_rules: data.hostRules || null,
        cancellation_policy: data.cancellationPolicy || null,
        instant_book: instantBook,
        is_covered: selectedAmenities.includes('covered'),
        is_secure: selectedAmenities.includes('security'),
        has_ev_charging: hasEvCharging,
        is_ada_accessible: selectedAmenities.includes('ada'),
        ev_charging_instructions: hasEvCharging ? evChargingInstructions : null,
        ev_charging_premium_per_hour: hasEvCharging ? parseFloat(evChargingPremium) || 0 : 0,
        updated_at: new Date().toISOString()
      };
      const {
        error
      } = await supabase.from('spots').update(updateData).eq('id', spotId);
      if (error) throw error;
      toast.success('Spot updated successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error updating spot:', error);
      toast.error('Failed to update spot');
    } finally {
      setIsSaving(false);
    }
  };
  if (isLoading) {
    return <div className="bg-background pb-20">
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          <p className="text-center text-muted-foreground">Loading...</p>
        </div>
      </div>;
  }
  if (!user) {
    return <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-6">
            Please sign in to edit your spot.
          </p>
          <Button onClick={() => navigate('/auth')} className="w-full">
            Sign In
          </Button>
        </Card>
      </div>;
  }
  return <div className="bg-background pb-20">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Spot</h1>
            <p className="text-sm text-muted-foreground">Update your listing</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Basic Information</h2>
                <p className="text-sm text-muted-foreground">
                  Update your parking spot details
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="category">Spot Type</Label>
                  <select
                    id="category"
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setValue('category', e.target.value as typeof spotCategories[number]);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm mt-1.5"
                  >
                    <option value="">Select a spot type</option>
                    {spotCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.category && <p className="text-sm text-destructive mt-1">{String(errors.category.message)}</p>}
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                    <Input id="address" placeholder="Enter your address" {...register('address')} onChange={e => handleAddressChange(e.target.value)} onFocus={() => {
                    const value = (document.getElementById('address') as HTMLInputElement)?.value;
                    if (value && value.length >= 3) {
                      setShowSuggestions(true);
                    }
                  }} className="pl-10" autoComplete="off" />
                    {loadingSuggestions && <div className="absolute right-3 top-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      </div>}
                    {showSuggestions && addressSuggestions.length > 0 && <div className="suggestions-dropdown absolute top-full mt-1 w-full bg-background border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                        {addressSuggestions.map((suggestion, index) => <button key={index} type="button" onClick={() => handleSuggestionSelect(suggestion)} className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {suggestion.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {suggestion.place_formatted}
                              </p>
                            </div>
                          </button>)}
                      </div>}
                  </div>
                  {errors.address && <p className="text-sm text-destructive mt-1">{String(errors.address.message)}</p>}
                </div>

                <div>
                  <Label htmlFor="hourlyRate">Hourly Rate</Label>
                  <div className="relative mt-1.5">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="hourlyRate" type="number" step="0.01" placeholder="0.00" {...register('hourlyRate')} className="pl-10" />
                  </div>
                  {errors.hourlyRate && <p className="text-sm text-destructive mt-1">{String(errors.hourlyRate.message)}</p>}
                </div>

                <div>
                  <Label htmlFor="description">Spot Description</Label>
                  <Textarea id="description" placeholder="Describe your parking spot, access instructions, and any important details..." rows={6} {...register('description')} className="mt-1.5 resize-none" />
                  {errors.description && <p className="text-sm text-destructive mt-1">{String(errors.description.message)}</p>}
                </div>

                <div>
                  <Label className="mb-3 block">Amenities</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {amenitiesList.map(amenity => {
                      const Icon = amenity.icon;
                      const isSelected = selectedAmenities.includes(amenity.id);
                      return (
                        <button
                          key={amenity.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => toggleAmenity(amenity.id)}
                          className={`touch-scroll-safe p-4 rounded-lg border-2 transition-colors text-center ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border bg-background'
                          }`}
                        >
                          <Icon className={`h-6 w-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                          <p className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                            {amenity.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* EV Charging Configuration (only shown if EV amenity is selected) */}
                {selectedAmenities.includes('ev') && (
                  <Card className="p-4 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <h3 className="font-semibold text-green-800 dark:text-green-300">EV Charging Settings</h3>
                      </div>
                      
                      <div>
                        <Label htmlFor="evPremium">EV Charging Premium ($/hour) <span className="text-destructive">*</span></Label>
                        <div className="relative mt-1.5">
                          <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="evPremium"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="2.00"
                            value={evChargingPremium}
                            onChange={(e) => setEvChargingPremium(e.target.value)}
                            className={`pl-10 ${(!evChargingPremium || parseFloat(evChargingPremium) <= 0) ? 'border-destructive' : ''}`}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Required: Additional charge per hour when driver uses EV charging (must be &gt; $0)
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="evInstructions">Charging Instructions</Label>
                        <Textarea
                          id="evInstructions"
                          placeholder="e.g., Use outlet on left wall, Level 2 charger requires app, Max 2 hours charging..."
                          rows={3}
                          value={evChargingInstructions}
                          onChange={(e) => setEvChargingInstructions(e.target.value)}
                          className="mt-1.5 resize-none"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          These instructions will be shown to drivers who opt-in to EV charging
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Instant Book Toggle */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                        <BoltIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <Label htmlFor="instant-book" className="text-base font-medium cursor-pointer">
                          Instant Book
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow drivers to book without your approval
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="instant-book"
                      checked={instantBook}
                      onCheckedChange={setInstantBook}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="accessNotes">Access Instructions</Label>
                  <Textarea id="accessNotes" placeholder="How do guests access the parking spot? Include gate codes, parking instructions, etc." rows={4} {...register('accessNotes')} className="mt-1.5 resize-none" />
                </div>

                

                

                <div id="photos-section">
                  <div className="flex items-center justify-between mb-3">
                    <Label>Photos</Label>
                    {stagedPhotos.length > 0 && <Badge variant="secondary" className="text-xs">
                        {stagedPhotos.length} Photo{stagedPhotos.length !== 1 ? 's' : ''}
                      </Badge>}
                  </div>

                  {pendingUploadPreviews.length > 0 && <div className="mb-6 p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-primary">New Photos Ready to Upload</p>
                          <p className="text-xs text-muted-foreground mt-0.5">These will be uploaded when you click "Save Changes"</p>
                        </div>
                        <Badge variant="default" className="text-xs">
                          {pendingUploadPreviews.length} New
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {pendingUploadPreviews.map((url, idx) => <div key={`pending-${idx}`} className="relative aspect-video rounded-lg overflow-hidden border-2 border-primary/50 bg-background shadow-sm">
                            <img src={url} alt={`New photo ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 shadow-md">
                              <Upload className="h-3 w-3" />
                              New
                            </div>
                            <Button type="button" size="sm" variant="destructive" className="absolute top-2 right-2 h-7 w-7 p-0 shadow-md" onClick={() => {
                        setPendingUploads(prev => prev.filter((_, i) => i !== idx));
                        setPendingUploadPreviews(prev => {
                          URL.revokeObjectURL(prev[idx]);
                          return prev.filter((_, i) => i !== idx);
                        });
                        toast.info('Photo removed from upload queue');
                      }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>)}
                      </div>
                    </div>}
                  
                  {stagedPhotos.length > 0 && <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <p className="text-sm font-medium">Current Photos</p>
                        <Badge variant="outline" className="text-xs">
                          <GripVertical className="h-3 w-3 mr-1" />
                          Drag to reorder
                        </Badge>
                      </div>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={stagedPhotos.map(p => p.id)} strategy={verticalListSortingStrategy}>
                          <div className="grid grid-cols-2 gap-3">
                            <TooltipProvider>
                              {stagedPhotos.map((photo, index) => {
                            const isMarkedForDelete = pendingDeletes.has(photo.id);
                            return <SortablePhoto key={photo.id} photo={photo} index={index} isMarkedForDelete={isMarkedForDelete} onSetPrimary={stagePrimaryPhoto} onDelete={stagePhotoDelete} onUndoDelete={photoId => {
                              setPendingDeletes(prev => {
                                const next = new Set(prev);
                                next.delete(photoId);
                                return next;
                              });
                            }} onMoveLeft={() => moveStagedPhoto(index, 'left')} onMoveRight={() => moveStagedPhoto(index, 'right')} isFirst={index === 0} isLast={index === stagedPhotos.length - 1} />;
                          })}
                            </TooltipProvider>
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>}

                  {isUploadingPhotos && uploadStatuses.length > 0 && <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Uploading Photos</p>
                        <p className="text-sm text-muted-foreground">{Math.round(uploadProgress)}% Overall</p>
                      </div>
                      <Progress value={uploadProgress} className="h-2 mb-3" />
                      
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {uploadStatuses.map((status, idx) => <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded bg-background/50">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{status.fileName}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {status.status === 'pending' && <>
                                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                                    <span className="text-muted-foreground">Waiting...</span>
                                  </>}
                                {status.status === 'uploading' && <>
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-primary">Uploading {status.progress}%</span>
                                  </>}
                                {status.status === 'complete' && <>
                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                    <span className="text-green-500">Complete</span>
                                  </>}
                                {status.status === 'error' && <>
                                    <div className="w-2 h-2 rounded-full bg-destructive" />
                                    <span className="text-destructive">Failed</span>
                                  </>}
                              </div>
                            </div>
                            {status.status === 'uploading' && <div className="w-20">
                                <Progress value={status.progress} className="h-1" />
                              </div>}
                          </div>)}
                      </div>
                    </div>}

                  <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`rounded-lg border-2 border-dashed transition-all ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border bg-background'}`}>
                    <div className="p-6">
                      <div className="flex flex-col items-center text-center mb-4 cursor-pointer" onClick={() => document.getElementById('edit-photo-upload')?.click()}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Camera className={`h-6 w-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <p className="text-sm font-medium mb-1">
                          {isDragging ? 'Drop photos here' : 'Add photos to your listing'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Drag and drop, or click to browse
                        </p>
                      </div>
                      
                      <Button type="button" variant="outline" className="w-full" onClick={() => document.getElementById('edit-photo-upload')?.click()} disabled={isUploadingPhotos}>
                        <Upload className="h-4 w-4 mr-2" />
                        {isUploadingPhotos ? 'Uploading...' : 'Add Photos'}
                      </Button>
                    </div>
                  </div>
                  
                  <input id="edit-photo-upload" type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                  
                  <p className="text-xs text-muted-foreground mt-3">
                    <Star className="h-3 w-3 inline mr-1" />
                    All changes save when you click "Save Changes" button below.
                  </p>
                </div>

                {/* Availability Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Label className="text-base">Availability Schedule</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Set weekly hours and special date overrides
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/edit-availability/${spotId}`)}
                  >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Edit Availability
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        <Card className="border-destructive">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold text-destructive">Danger Zone</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete this listing
                </p>
              </div>
              <Button type="button" variant="destructive" className="w-full" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Listing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This action permanently removes the spot, its availability, and future bookings. 
              Past bookings and earnings remain in history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};
export default EditSpot;