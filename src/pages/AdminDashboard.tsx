import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { toast } from "sonner";
import { Shield, XCircle, AlertTriangle, Ban, Eye, Loader2, ArrowLeft } from "lucide-react";
import { usePagination, getPaginationRange } from "@/hooks/usePagination";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

const log = logger.scope('AdminDashboard');

interface SpotReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  spot: {
    id: string;
    title: string;
    address: string;
    status: string;
    host_id: string;
    host: {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      strikes: number | null;
    };
  };
  reporter: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<SpotReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [totalReports, setTotalReports] = useState(0);

  const PAGE_SIZE = 10;
  const pagination = usePagination({ pageSize: PAGE_SIZE });

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchReports();
    }
  }, [isAdmin, filter, pagination.currentPage]);

  const checkAdminStatus = async () => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (error) {
      log.error("Error checking admin status:", error);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(!!data);
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      // First, get the total count for pagination
      let countQuery = supabase
        .from("spot_reports")
        .select("id", { count: "exact", head: true });

      if (filter === "pending") {
        countQuery = countQuery.eq("status", "pending");
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        log.error("Error getting count:", countError);
      } else {
        setTotalReports(count || 0);
        pagination.setTotalItems(count || 0);
      }

      // Now fetch the paginated data
      const { from, to } = getPaginationRange(pagination.currentPage, PAGE_SIZE);

      let query = supabase
        .from("spot_reports")
        .select(`
          id, reason, details, status, created_at,
          spot:spots!spot_reports_spot_id_fkey (
            id, title, address, status, host_id,
            host:profiles!spots_host_id_fkey (
              user_id, first_name, last_name, email, strikes
            )
          ),
          reporter:profiles!spot_reports_reporter_id_fkey (
            first_name, last_name, email
          )
        `)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filter === "pending") {
        query = query.eq("status", "pending");
      }

      const { data, error } = await query;

      if (error) {
        log.error("Error fetching reports:", error);
        toast.error("Failed to load reports");
        return;
      }

      setReports(data as unknown as SpotReport[]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: "dismiss" | "warn" | "deactivate", report: SpotReport) => {
    setActionLoading(`${action}-${report.id}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired");
        return;
      }

      const response = await supabase.functions.invoke("admin-action", {
        body: {
          action,
          reportId: report.id,
          spotId: report.spot.id,
          hostId: report.spot.host_id,
          hostEmail: report.spot.host?.email,
          spotTitle: report.spot.title,
          reportReason: report.reason,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success(
        action === "dismiss" ? "Report dismissed" :
        action === "warn" ? "Host warned and strike added" :
        "Listing deactivated"
      );

      fetchReports();
    } catch (error: any) {
      log.error("Action error:", error);
      toast.error(error.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="destructive">Pending</Badge>;
      case "dismissed":
        return <Badge variant="secondary">Dismissed</Badge>;
      case "warned":
        return <Badge className="bg-amber-500 text-white">Warned</Badge>;
      case "resolved":
        return <Badge className="bg-green-600 text-white">Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      inaccurate_info: "Inaccurate Info",
      misleading_photos: "Misleading Photos",
      scam: "Potential Scam",
      unsafe: "Unsafe Location",
      unavailable: "Unavailable",
      other: "Other",
    };
    return labels[reason] || reason;
  };

  if (isAdmin === null) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage reported listings</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => { setFilter("pending"); pagination.setPage(1); }}
            size="sm"
          >
            Pending
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => { setFilter("all"); pagination.setPage(1); }}
            size="sm"
          >
            All Reports
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spot Reports</CardTitle>
          <CardDescription>
            {filter === "pending" ? "Reports requiring review" : "All submitted reports"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No {filter === "pending" ? "pending " : ""}reports found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Spot</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reporter</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{getStatusBadge(report.status)}</TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="font-medium truncate">{report.spot?.title || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {report.spot?.address}
                          </p>
                          {report.spot?.status === "inactive" && (
                            <Badge variant="outline" className="text-xs mt-1">Inactive</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {report.spot?.host?.first_name || "Unknown"} {report.spot?.host?.last_name || ""}
                          </p>
                          <p className="text-xs text-muted-foreground">{report.spot?.host?.email}</p>
                          {(report.spot?.host?.strikes ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              {report.spot?.host?.strikes} strike{(report.spot?.host?.strikes ?? 0) > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{getReasonLabel(report.reason)}</p>
                          {report.details && (
                            <p className="text-xs text-muted-foreground max-w-[150px] truncate">
                              {report.details}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {report.reporter?.first_name || "Anonymous"} {report.reporter?.last_name || ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(report.created_at), "MMM d, yyyy")}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/spot/${report.spot?.id}`)}
                            title="View Spot"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {report.status === "pending" && (
                            <>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!!actionLoading}
                                    title="Dismiss Report"
                                  >
                                    {actionLoading === `dismiss-${report.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Dismiss Report?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will mark the report as dismissed. The host will not be notified.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleAction("dismiss", report)}>
                                      Dismiss
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!!actionLoading}
                                    title="Warn Host"
                                  >
                                    {actionLoading === `warn-${report.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Warn Host?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will send a warning email to the host, add a strike to their account, 
                                      and create an in-app notification. The listing will remain active.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleAction("warn", report)}
                                      className="bg-amber-500 hover:bg-amber-600"
                                    >
                                      Send Warning
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!!actionLoading}
                                    title="Deactivate Listing"
                                  >
                                    {actionLoading === `deactivate-${report.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Ban className="h-4 w-4 text-destructive" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Deactivate Listing?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will immediately deactivate the listing, making it invisible to drivers.
                                      The host will be notified via email and in-app notification.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleAction("deactivate", report)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Deactivate
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {pagination.startIndex + 1} to {Math.min(pagination.endIndex + 1, totalReports)} of {totalReports} reports
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => pagination.previousPage()}
                          className={!pagination.hasPreviousPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>

                      {pagination.getPageRange()[0] > 1 && (
                        <>
                          <PaginationItem>
                            <PaginationLink onClick={() => pagination.setPage(1)} className="cursor-pointer">
                              1
                            </PaginationLink>
                          </PaginationItem>
                          {pagination.getPageRange()[0] > 2 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                        </>
                      )}

                      {pagination.getPageRange().map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => pagination.setPage(page)}
                            isActive={page === pagination.currentPage}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}

                      {pagination.getPageRange()[pagination.getPageRange().length - 1] < pagination.totalPages && (
                        <>
                          {pagination.getPageRange()[pagination.getPageRange().length - 1] < pagination.totalPages - 1 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink onClick={() => pagination.setPage(pagination.totalPages)} className="cursor-pointer">
                              {pagination.totalPages}
                            </PaginationLink>
                          </PaginationItem>
                        </>
                      )}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => pagination.nextPage()}
                          className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
