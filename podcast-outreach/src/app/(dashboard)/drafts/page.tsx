"use client";

import { useState } from "react";
import { useDrafts, useUpdateDraft, useSendEmail } from "@/hooks/use-podcasts";
import { QA_CHECKLIST } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Send,
  Edit,
  Check,
  Sparkles,
  Mail,
  AlertTriangle,
} from "lucide-react";
import type { PodcastWithRelations, QAChecklistState } from "@/types";

export default function DraftsPage() {
  const [selectedDraft, setSelectedDraft] = useState<PodcastWithRelations | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [qaChecklist, setQaChecklist] = useState<QAChecklistState>({});

  const { data: drafts, isLoading } = useDrafts("DRAFTED,QA_APPROVED");
  const updateDraft = useUpdateDraft();
  const sendEmail = useSendEmail();

  const openEditor = (draft: PodcastWithRelations) => {
    setSelectedDraft(draft);
    setEditedSubject(draft.emailSubject || "");
    setEditedBody(draft.emailDraft || "");
    // Initialize QA checklist from draft
    setQaChecklist((draft.qaChecklist as QAChecklistState) || {});
  };

  const handleSave = () => {
    if (selectedDraft) {
      updateDraft.mutate({
        podcastId: selectedDraft.id,
        emailSubject: editedSubject,
        emailDraft: editedBody,
      });
      setSelectedDraft(null);
    }
  };

  const handleApprove = (draft: PodcastWithRelations) => {
    // Check if all required QA items are checked
    const allRequiredChecked = QA_CHECKLIST.filter((item) => item.required).every(
      (item) => qaChecklist[item.id]
    );

    if (!allRequiredChecked) {
      alert("Please complete all required QA checks before approving.");
      return;
    }

    updateDraft.mutate({
      podcastId: draft.id,
      status: "QA_APPROVED",
    });
  };

  const handleSend = (draft: PodcastWithRelations) => {
    if (confirm("Are you sure you want to send this email?")) {
      sendEmail.mutate({ podcastId: draft.id });
    }
  };

  const toggleQaItem = (itemId: string) => {
    setQaChecklist((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const draftedEmails = drafts?.filter((d) => d.status === "DRAFTED") || [];
  const approvedEmails = drafts?.filter((d) => d.status === "QA_APPROVED") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Drafts</h1>
        <p className="text-sm text-gray-700">
          Review and edit AI-generated email drafts before sending
        </p>
      </div>

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">
            Pending QA
            <Badge variant="secondary" className="ml-2">
              {draftedEmails.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">
            Ready to Send
            <Badge variant="secondary" className="ml-2">
              {approvedEmails.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-6">
          <div className="grid gap-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-700">Loading...</div>
            ) : draftedEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No drafts pending QA
                  </h3>
                  <p className="text-gray-700">
                    Generate email drafts from the Pipeline page
                  </p>
                </CardContent>
              </Card>
            ) : (
              draftedEmails.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onEdit={() => openEditor(draft)}
                  onApprove={() => handleApprove(draft)}
                  qaChecklist={qaChecklist}
                  onToggleQa={toggleQaItem}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <div className="grid gap-4">
            {approvedEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Mail className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No emails ready to send
                  </h3>
                  <p className="text-gray-700">
                    Approve drafts to move them here
                  </p>
                </CardContent>
              </Card>
            ) : (
              approvedEmails.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onEdit={() => openEditor(draft)}
                  onSend={() => handleSend(draft)}
                  showSend
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!selectedDraft} onOpenChange={() => setSelectedDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Draft</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                To: {selectedDraft?.primaryEmail || "No email"}
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <Input
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Body</label>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="mt-1 w-full h-64 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-950"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDraft(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateDraft.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraftCard({
  draft,
  onEdit,
  onApprove,
  onSend,
  showSend = false,
  qaChecklist,
  onToggleQa,
}: {
  draft: PodcastWithRelations;
  onEdit: () => void;
  onApprove?: () => void;
  onSend?: () => void;
  showSend?: boolean;
  qaChecklist?: QAChecklistState;
  onToggleQa?: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{draft.showName}</CardTitle>
            <p className="text-sm text-gray-700 mt-1">
              To: {draft.primaryEmail || "No email"}
            </p>
            {draft.tier && (
              <Badge
                variant={
                  draft.tier === "TIER_1"
                    ? "default"
                    : draft.tier === "TIER_2"
                    ? "secondary"
                    : "destructive"
                }
                className="mt-1"
              >
                {draft.tier.replace("_", " ")}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            {showSend ? (
              <Button size="sm" onClick={onSend}>
                <Send className="h-3 w-3 mr-1" />
                Send
              </Button>
            ) : (
              <Button size="sm" onClick={onApprove}>
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-gray-900 mb-2">
            {draft.emailSubject}
          </p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
            {draft.emailDraft}
          </p>
        </div>

        {/* QA Checklist (only show for pending drafts) */}
        {!showSend && qaChecklist && onToggleQa && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">QA Checklist</span>
            </div>
            <div className="space-y-2">
              {QA_CHECKLIST.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    id={item.id}
                    checked={qaChecklist[item.id] || false}
                    onCheckedChange={() => onToggleQa(item.id)}
                  />
                  <label
                    htmlFor={item.id}
                    className={`text-sm ${
                      item.required ? "text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {item.label}
                    {item.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
