import React, { useState, useEffect } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Shield, Clock, Zap, Car, Lightbulb, Camera, MapPin, DollarSign, Trash2, Upload, X, Star, CheckCircle2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const formSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  address: z.string().min(5, 'Address is required'),
  hourlyRate: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Hourly rate must be a positive number',
  }),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

const amenitiesList = [
  { id: 'covered', label: 'Covered', icon: Shield, dbField: 'is_covered' },
  { id: 'security', label: 'Security Camera', icon: Camera, dbField: 'is_secure' },
  { id: 'ev', label: 'EV Charging', icon: Zap, dbField: 'has_ev_charging' },
];

interface SpotPhoto {
  id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

const EditSpot = () => {
  const navigate = useNavigate();
  const { spotId } = useParams<{ spotId: string }>();
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<SpotPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [recentlyUploaded, setRecentlyUploaded] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [hasOrderChanged, setHasOrderChanged] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    console.log('[DEBUG] newPhotos state changed:', newPhotos.length, 'photos');
  }, [newPhotos]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    const fetchSpot = async () => {
      if (!spotId) return;

      try {
        // Check authentication first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data: spotData, error: spotError } = await supabase
          .from('spots')
          .select('*')
          .eq('id', spotId)
          .single();

        if (spotError) throw spotError;

        // Verify ownership
        if (spotData.host_id !== user.id) {
          toast.error('You do not have permission to edit this spot');
          navigate('/dashboard');
          return;
        }

        // Populate form
        setValue('title', spotData.title);
        setValue('address', spotData.address);
        setValue('hourlyRate', spotData.hourly_rate.toString());
        setValue('description', spotData.description || '');

        // Set amenities
        const amenities = [];
        if (spotData.is_covered) amenities.push('covered');
        if (spotData.is_secure) amenities.push('security');
        if (spotData.has_ev_charging) amenities.push('ev');
        setSelectedAmenities(amenities);

        // Fetch existing photos
        const { data: photosData, error: photosError } = await supabase
          .from('spot_photos')
          .select('*')
          .eq('spot_id', spotId)
          .order('sort_order', { ascending: true });

        if (!photosError && photosData) {
          setExistingPhotos(photosData);
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

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[DEBUG] handlePhotoSelect called');
    const selected = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    console.log('[DEBUG] Selected files:', selected.length);
    
    if (selected.length === 0) {
      e.target.value = '';
      return;
    }
    
    setNewPhotos((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const deduped = selected.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));
      return [...prev, ...deduped];
    });
    
    // Show toast AFTER the state update, outside the callback
    toast.success(`${selected.length} photo${selected.length > 1 ? 's' : ''} ready to upload`);
    
    // Reset so selecting the same files again will trigger onChange
    e.target.value = '';
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(newPhotos.filter((_, i) => i !== index));
  };

  const deleteExistingPhoto = async (photoId: string, photoUrl: string) => {
    try {
      // Extract file path from URL
      const urlParts = photoUrl.split('/');
      const filePath = urlParts.slice(urlParts.indexOf('spot-photos') + 1).join('/');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('spot-photos')
        .remove([filePath]);

      if (storageError) {
        console.error('Error deleting from storage:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('spot_photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      setExistingPhotos(existingPhotos.filter(p => p.id !== photoId));
      toast.success('Photo deleted');
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  };

  const setPrimaryPhoto = async (photoId: string) => {
    try {
      // First, set all photos to non-primary
      await supabase
        .from('spot_photos')
        .update({ is_primary: false })
        .eq('spot_id', spotId);

      // Then set the selected photo as primary
      const { error } = await supabase
        .from('spot_photos')
        .update({ is_primary: true })
        .eq('id', photoId);

      if (error) throw error;

      setExistingPhotos(existingPhotos.map(p => ({
        ...p,
        is_primary: p.id === photoId
      })));
      toast.success('Primary photo updated');
    } catch (error) {
      console.error('Error setting primary photo:', error);
      toast.error('Failed to set primary photo');
    }
  };

  const uploadNewPhotos = async () => {
    if (newPhotos.length === 0 || !spotId) return;

    setIsUploadingPhotos(true);
    setUploadProgress(0);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < newPhotos.length; i++) {
        try {
          const file = newPhotos[i];
          // Use compressed file's extension when available; fall back to MIME type mapping
          const compressedFile = await compressImage(file);
          const extFromName = (compressedFile as File).name?.split('.').pop();
          const extFromType = (compressedFile as File).type?.split('/').pop();
          const safeExt = (extFromName || extFromType || 'jpg').toLowerCase().replace('jpeg', 'jpg');

          // Generate a safe unique filename, with fallback if crypto.randomUUID is not available
          const uid = (globalThis as any)?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const filePath = `${spotId}/${uid}.${safeExt}`;

          console.log('[PERF] Compressing image before upload:', file.name);

          console.log('[UPLOAD] Starting upload:', filePath);
          const { error: uploadError } = await supabase.storage
            .from('spot-photos')
            .upload(filePath, compressedFile);

          if (uploadError) {
            console.error('[UPLOAD] Storage upload error for photo', i + 1, ':', uploadError);
            throw uploadError;
          }


          const { data: { publicUrl } } = supabase.storage
            .from('spot-photos')
            .getPublicUrl(filePath);

          console.log('[UPLOAD] Got public URL:', publicUrl);

          // Save to database - removed .select().single() which was causing the error
          const { error: dbError } = await supabase
            .from('spot_photos')
            .insert({
              spot_id: spotId,
              url: publicUrl,
              is_primary: existingPhotos.length === 0 && i === 0,
              sort_order: existingPhotos.length + i,
            });

          if (dbError) {
            console.error('[UPLOAD] Database insert error for photo', i + 1, ':', dbError);
            throw dbError;
          }

          console.log('[UPLOAD] Successfully saved photo', i + 1, 'to database');
          successCount++;

          // Update progress
          setUploadProgress(((i + 1) / newPhotos.length) * 100);
        } catch (error) {
          console.error(`[UPLOAD] Failed to upload photo ${i + 1} of ${newPhotos.length}:`, error);
          failCount++;
          // Continue with next photo instead of stopping
        }
      }

      // Refresh photos
      const { data: photosData, error: fetchError } = await supabase
        .from('spot_photos')
        .select('*')
        .eq('spot_id', spotId)
        .order('sort_order', { ascending: true });

      if (fetchError) {
        console.error('[UPLOAD] Error fetching updated photos:', fetchError);
      } else if (photosData) {
        setExistingPhotos(photosData);
        
        // Mark recently uploaded photos for animation
        const recentIds = photosData.slice(-successCount).map(p => p.id);
        setRecentlyUploaded(recentIds);
        
        // Clear recently uploaded indicator after 3 seconds
        setTimeout(() => {
          setRecentlyUploaded([]);
        }, 3000);

        // Scroll to photos section
        setTimeout(() => {
          document.getElementById('photos-section')?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest' 
          });
        }, 100);
      }

      setNewPhotos([]);
      
      if (successCount > 0 && failCount === 0) {
        toast.success(`Successfully uploaded ${successCount} photo(s)`);
      } else if (successCount > 0 && failCount > 0) {
        toast.success(`Uploaded ${successCount} photo(s), ${failCount} failed`);
      } else {
        toast.error('All photo uploads failed. Please try again.');
      }
    } catch (error) {
      console.error('[UPLOAD] Upload process failed:', error);
      toast.error('Failed to upload photos. Please try again.');
    } finally {
      setIsUploadingPhotos(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const dropped = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );
    if (dropped.length === 0) return;

    setNewPhotos((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const deduped = dropped.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));
      return [...prev, ...deduped];
    });
    
    // Toast OUTSIDE the setter
    toast.success(`Photo(s) ready to upload`);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const moveExistingPhoto = (index: number, direction: 'left' | 'right') => {
    const newPhotos = [...existingPhotos];
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= existingPhotos.length) return;
    
    [newPhotos[index], newPhotos[newIndex]] = [newPhotos[newIndex], newPhotos[index]];
    
    setExistingPhotos(newPhotos);
    setHasOrderChanged(true);
  };

  const savePhotoOrder = async () => {
    if (!spotId || isSavingOrder) return;

    try {
      setIsSavingOrder(true);

      // Update sort_order for each photo
      for (let i = 0; i < existingPhotos.length; i++) {
        const photo = existingPhotos[i];
        await supabase
          .from('spot_photos')
          .update({ sort_order: i })
          .eq('id', photo.id);
      }

      setHasOrderChanged(false);
      toast.success('Photo order saved');
    } catch (error) {
      console.error('Error saving photo order:', error);
      toast.error('Failed to save photo order');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDelete = async () => {
    if (!spotId || isDeleting) return;

    try {
      setIsDeleting(true);

      // Check for future bookings
      const { data: futureBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id')
        .eq('spot_id', spotId)
        .gt('end_at', new Date().toISOString())
        .in('status', ['pending', 'paid']);

      if (bookingsError) throw bookingsError;

      if (futureBookings && futureBookings.length > 0) {
        toast.error('Cannot delete spot with future bookings. Please cancel them first or archive the listing.');
        setShowDeleteDialog(false);
        return;
      }

      // Delete spot photos first (if any)
      await supabase
        .from('spot_photos')
        .delete()
        .eq('spot_id', spotId);

      // Delete availability rules
      await supabase
        .from('availability_rules')
        .delete()
        .eq('spot_id', spotId);

      // Delete the spot
      const { error: deleteError } = await supabase
        .from('spots')
        .delete()
        .eq('id', spotId);

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
    if (!spotId || isSaving) return;

    try {
      setIsSaving(true);

      const updateData = {
        title: data.title,
        address: data.address,
        hourly_rate: parseFloat(data.hourlyRate),
        description: data.description,
        is_covered: selectedAmenities.includes('covered'),
        is_secure: selectedAmenities.includes('security'),
        has_ev_charging: selectedAmenities.includes('ev'),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('spots')
        .update(updateData)
        .eq('id', spotId);

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
    return (
      <div className="bg-background pb-20">
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          <p className="text-center text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-6">
            Please sign in to edit your spot.
          </p>
          <Button 
            onClick={() => navigate('/auth')}
            className="w-full"
          >
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  // DEBUG: Log render state
  console.log('[DEBUG] Render: newPhotos.length =', newPhotos.length);

  return (
    <div className="bg-background pb-20">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
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
                  <Label htmlFor="title">Spot Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Downtown Covered Parking"
                    {...register('title')}
                    className="mt-1.5"
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive mt-1">{String(errors.title.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      placeholder="Enter your address"
                      {...register('address')}
                      className="pl-10"
                    />
                  </div>
                  {errors.address && (
                    <p className="text-sm text-destructive mt-1">{String(errors.address.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="hourlyRate">Hourly Rate</Label>
                  <div className="relative mt-1.5">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="hourlyRate"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...register('hourlyRate')}
                      className="pl-10"
                    />
                  </div>
                  {errors.hourlyRate && (
                    <p className="text-sm text-destructive mt-1">{String(errors.hourlyRate.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Spot Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your parking spot, access instructions, and any important details..."
                    rows={6}
                    {...register('description')}
                    className="mt-1.5 resize-none"
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive mt-1">{String(errors.description.message)}</p>
                  )}
                </div>

                <div>
                  <Label className="mb-3 block">Amenities</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {amenitiesList.map((amenity) => {
                      const Icon = amenity.icon;
                      const isSelected = selectedAmenities.includes(amenity.id);
                      return (
                        <button
                          key={amenity.id}
                          type="button"
                          onClick={() => toggleAmenity(amenity.id)}
                          className={`p-4 rounded-lg border-2 transition-all text-center ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-background hover:border-primary/50'
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

                {/* Photos Section */}
                <div id="photos-section">
                  <div className="flex items-center justify-between mb-3">
                    <Label>Photos</Label>
                    <div className="flex gap-2">
                      {existingPhotos.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {existingPhotos.length} Uploaded
                        </Badge>
                      )}
                      {newPhotos.length > 0 && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                          {newPhotos.length} Pending
                        </Badge>
                      )}
                      {hasOrderChanged && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={savePhotoOrder}
                          disabled={isSavingOrder}
                          className="h-7"
                        >
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          Save Order
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Existing Photos */}
                  {existingPhotos.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <p className="text-sm font-medium">Current Photos</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <TooltipProvider>
                          {existingPhotos.map((photo, index) => {
                            const isRecent = recentlyUploaded.includes(photo.id);
                            return (
                              <div key={photo.id} className="relative group">
                                <div className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                                  photo.is_primary 
                                    ? 'border-primary ring-2 ring-primary/20' 
                                    : isRecent
                                    ? 'border-green-500 ring-2 ring-green-500/20 animate-fade-in'
                                    : 'border-border'
                                }`}>
                                  <img
                                    src={photo.url}
                                    alt="Spot"
                                    className="w-full h-full object-cover"
                                  />
                                  
                                  {/* Order Badge */}
                                  <Badge 
                                    variant="secondary" 
                                    className="absolute top-2 left-2 text-xs font-semibold z-10"
                                  >
                                    #{index + 1}
                                  </Badge>
                                  
                                  {/* Primary Badge */}
                                  {photo.is_primary && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-lg z-10">
                                      <Star className="h-3.5 w-3.5 fill-current" />
                                      Primary
                                    </div>
                                  )}
                                  
                                  {/* Recently Uploaded Badge */}
                                  {isRecent && (
                                    <div className="absolute top-10 right-2 bg-green-500 text-white px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-lg animate-scale-in z-10">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Uploaded
                                    </div>
                                  )}
                                  
                                  {/* Hover Overlay */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-2">
                                    {!photo.is_primary && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setPrimaryPhoto(photo.id)}
                                            className="shadow-lg"
                                          >
                                            <Star className="h-4 w-4 mr-1.5" />
                                            Set Primary
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>This photo will appear first</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    
                                    <div className="flex gap-2">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => moveExistingPhoto(index, 'left')}
                                            disabled={index === 0}
                                            className="shadow-lg h-8 w-8 p-0"
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Move Left</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => moveExistingPhoto(index, 'right')}
                                            disabled={index === existingPhotos.length - 1}
                                            className="shadow-lg h-8 w-8 p-0"
                                          >
                                            <ChevronRight className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Move Right</TooltipContent>
                                      </Tooltip>
                                    </div>
                                    
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => deleteExistingPhoto(photo.id, photo.url)}
                                      className="shadow-lg"
                                    >
                                      <Trash2 className="h-4 w-4 mr-1.5" />
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </TooltipProvider>
                      </div>
                    </div>
                  )}

                  {/* New Photos Preview */}
                  {newPhotos.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <p className="text-sm font-medium">Pending Upload</p>
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                          Not yet saved
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {newPhotos.map((photo, index) => {
                          console.log('[DEBUG] Rendering photo preview', index);
                          const previewUrl = URL.createObjectURL(photo);
                          const isUploading = isUploadingPhotos;
                          const progress = Math.round(uploadProgress);

                          return (
                            <div key={index} className="relative group">
                              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                                <img
                                  src={previewUrl}
                                  alt={`New photo ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {isUploading && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <div className="text-white text-sm font-medium">
                                      {progress}%
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeNewPhoto(index)}
                                disabled={isUploading}
                                className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <div className="mt-2 text-xs text-muted-foreground truncate">
                                {photo.name}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upload Progress */}
                  {isUploadingPhotos && (
                    <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Uploading photos...</p>
                        <p className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</p>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}

                  {/* Drag & Drop Zone / Upload Buttons */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`rounded-lg border-2 border-dashed transition-all ${
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[1.02]'
                        : 'border-border bg-background'
                    }`}
                  >
                    <div className="p-6">
                      <div className="flex flex-col items-center text-center mb-4 cursor-pointer" onClick={() => document.getElementById('edit-photo-upload')?.click()}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${
                          isDragging ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                          <Camera className={`h-6 w-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <p className="text-sm font-medium mb-1">
                          {isDragging ? 'Drop photos here' : 'Add photos to your listing'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Drag and drop, or click to browse
                        </p>
                      </div>
                      
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={() => document.getElementById('edit-photo-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Browse Files
                        </Button>
                        {newPhotos.length > 0 && (
                          <Button
                            type="button"
                            onClick={uploadNewPhotos}
                            disabled={isUploadingPhotos}
                            className="flex-1"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {isUploadingPhotos ? 'Uploading...' : `Upload ${newPhotos.length} Photo${newPhotos.length > 1 ? 's' : ''}`}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <input
                    id="edit-photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  
                  <p className="text-xs text-muted-foreground mt-3">
                    <Star className="h-3 w-3 inline mr-1" />
                    Tip: Set a primary photo to make it appear first in your listing. Images are automatically compressed for optimal loading.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Delete Listing Section */}
        <Card className="border-destructive">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold text-destructive">Danger Zone</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete this listing
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Listing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
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
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EditSpot;
