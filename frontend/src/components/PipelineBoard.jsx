import React, { useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from './ui/badge';
import { Briefcase } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const SortableLeadCard = ({ lead, leadPriorityColors, leadSourceColors, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lead._id || lead.id, data: { ...lead } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-900/50 border border-white/10 rounded-xl p-4 cursor-grab active:cursor-grabbing hover:border-white/20 hover:bg-gray-900/80 transition-all shadow-sm ${isDragging ? 'z-50 ring-2 ring-emerald-500 shadow-xl' : ''}`}
      onClick={onClick}
    >
      <div className="font-medium text-white/90 mb-1 pointer-events-none">{lead.fullName}</div>
      {lead.company && <div className="text-xs text-gray-400 mb-2 truncate pointer-events-none"><Briefcase className="inline h-3 w-3 mr-1" />{lead.company}</div>}
      <div className="flex justify-between items-center mt-3 pointer-events-none">
        <Badge className={`px-2 py-0.5 rounded-full border border-white/10 bg-white/5 ${leadPriorityColors[lead.priority] || ''} text-[10px]`}>
          {lead.priority}
        </Badge>
        <div className="text-[10px] text-gray-500 capitalize">{lead.source.replace('_', ' ')}</div>
      </div>
    </div>
  );
};

// A generic LeadCard for DragOverlay
const LeadCard = ({ lead, leadPriorityColors, leadSourceColors }) => {
  return (
    <div className="bg-gray-800 border-2 border-emerald-500/50 rounded-xl p-4 shadow-2xl opacity-90 rotate-2 scale-105">
      <div className="font-medium text-white/90 mb-1">{lead.fullName}</div>
      {lead.company && <div className="text-xs text-gray-400 mb-2 truncate"><Briefcase className="inline h-3 w-3 mr-1" />{lead.company}</div>}
      <div className="flex justify-between items-center mt-3">
        <Badge className={`px-2 py-0.5 rounded-full border border-white/10 bg-white/5 ${leadPriorityColors[lead.priority] || ''} text-[10px]`}>
          {lead.priority}
        </Badge>
        <div className="text-[10px] text-gray-500 capitalize">{lead.source.replace('_', ' ')}</div>
      </div>
    </div>
  );
};

export default function PipelineBoard({ 
  leads, 
  setLeads, 
  API, 
  fetchClients, 
  fetchLeads, 
  leadStatusOptions, 
  leadStatusColors, 
  leadPriorityColors, 
  leadSourceColors, 
  setSelectedLead, 
  setIsViewLeadOpen 
}) {
  const [activeLead, setActiveLead] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event) => {
    const { active } = event;
    const lead = leads.find(l => (l._id || l.id) === active.id);
    setActiveLead(lead);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveContainer = leadStatusOptions.includes(activeId);
    const isOverContainer = leadStatusOptions.includes(overId);

    // Find the lead being dragged
    const activeLeadItem = leads.find(l => (l._id || l.id) === activeId);
    if (!activeLeadItem) return;

    // Determine target status
    let overStatus;
    if (isOverContainer) {
      overStatus = overId;
    } else {
      const overLead = leads.find(l => (l._id || l.id) === overId);
      if (overLead) overStatus = overLead.status;
    }

    if (!overStatus) return;

    // Optimistic status update during drag over
    if (activeLeadItem.status !== overStatus) {
      setLeads((prev) => {
        return prev.map(l => (l._id || l.id) === activeId ? { ...l, status: overStatus } : l);
      });
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    
    // Find final state in the current leads array
    const activeLeadItem = leads.find(l => (l._id || l.id) === activeId);
    if (!activeLeadItem) return;

    // Get the status container it was dropped into
    let targetStatus = activeLeadItem.status;
    if (leadStatusOptions.includes(overId)) {
      targetStatus = overId;
    } else {
      const overLead = leads.find(l => (l._id || l.id) === overId);
      if (overLead) targetStatus = overLead.status;
    }

    // Reorder leads array
    let updatedLeads = [...leads];
    
    const activeIndex = updatedLeads.findIndex(l => (l._id || l.id) === activeId);
    let overIndex = updatedLeads.findIndex(l => (l._id || l.id) === overId);

    if (activeIndex !== overIndex && overIndex !== -1 && !leadStatusOptions.includes(overId)) {
       updatedLeads = arrayMove(updatedLeads, activeIndex, overIndex);
    }
    
    // Assign order values based on array index within each status
    let reorderPayload = [];
    const finalLeads = updatedLeads.map(l => {
      // Create copy
      return {...l};
    });

    // Update order explicitly
    leadStatusOptions.forEach(status => {
      const leadsInStatus = finalLeads.filter(l => l.status === status);
      leadsInStatus.forEach((l, index) => {
        l.order = index;
        reorderPayload.push({ _id: l._id || l.id, status: l.status, order: l.order });
      });
    });

    // Update UI immediately
    setLeads(finalLeads);

    try {
      const response = await axios.patch(`${API}/leads/reorder`, { items: reorderPayload });
      
      // Check if it was converted
      if (targetStatus === 'converted' && activeLead && activeLead.status !== 'converted') {
        toast.success(`Lead converted to client!`);
        fetchClients();
      }
      
      // Optional: don't strictly re-fetch immediately if we trust optimistic UI, 
      // but safe to do it.
      // fetchLeads();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save lead positions');
      fetchLeads(); // Revert on failure
    }
  };

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.4',
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
        {leadStatusOptions.map(status => {
          const leadsInStatus = leads.filter(l => l.status === status);
          return (
            <div 
              key={status} 
              className="flex-shrink-0 w-80 bg-white/5 rounded-2xl border border-white/10 flex flex-col snap-start"
            >
              {/* Column Header */}
              <div className={`p-4 border-b border-white/10 rounded-t-2xl ${leadStatusColors[status] || 'bg-white/10 text-white'}`}>
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold capitalize">{status.replace('_', ' ')}</h3>
                  <Badge className="bg-white/20 text-current border-none">
                    {leadsInStatus.length}
                  </Badge>
                </div>
              </div>
              
              {/* Column Cards Container */}
              <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto max-h-[70vh]">
                <SortableContext 
                  id={status}
                  items={leadsInStatus.map(l => l._id || l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-3 min-h-[50px]">
                    {leadsInStatus.map(lead => (
                      <SortableLeadCard 
                        key={lead._id || lead.id} 
                        lead={lead} 
                        leadPriorityColors={leadPriorityColors} 
                        leadSourceColors={leadSourceColors}
                        onClick={() => {
                          setSelectedLead(lead);
                          setIsViewLeadOpen(true);
                        }}
                      />
                    ))}
                    {leadsInStatus.length === 0 && (
                      <div className="text-center py-8 text-white/20 text-sm border-2 border-dashed border-white/5 rounded-xl pointer-events-none">
                        Drop leads here
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeLead ? (
          <LeadCard 
            lead={activeLead} 
            leadPriorityColors={leadPriorityColors} 
            leadSourceColors={leadSourceColors} 
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
