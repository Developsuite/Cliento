import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
  rectIntersection,
  pointerWithin,
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
  } = useSortable({ id: lead._id || lead.id, data: { type: 'lead', status: lead.status, ...lead } });

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
      className={`bg-gray-900/50 border border-white/10 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-white/20 hover:bg-gray-900/80 transition-all shadow-sm ${isDragging ? 'z-50 ring-1 ring-emerald-500 shadow-md' : ''}`}
      onClick={onClick}
    >
      <div className="text-sm font-medium text-white/90 mb-0.5 pointer-events-none truncate">{lead.fullName}</div>
      {lead.company && <div className="text-[10px] text-gray-400 mb-1.5 truncate pointer-events-none"><Briefcase className="inline h-2.5 w-2.5 mr-1" />{lead.company}</div>}
      <div className="flex justify-between items-center mt-2 pointer-events-none">
        <Badge className={`px-1.5 py-0 rounded-full border border-white/10 bg-white/5 ${leadPriorityColors[lead.priority] || ''} text-[9px]`}>
          {lead.priority}
        </Badge>
        <div className="text-[9px] text-gray-500 capitalize">{lead.source.replace('_', ' ')}</div>
      </div>
    </div>
  );
};

// A generic LeadCard for DragOverlay
const LeadCard = ({ lead, leadPriorityColors, leadSourceColors }) => {
  return (
    <div className="bg-gray-800 border border-emerald-500/50 rounded-lg p-2.5 shadow-xl opacity-90 rotate-2 scale-105">
      <div className="text-sm font-medium text-white/90 mb-0.5 truncate">{lead.fullName}</div>
      {lead.company && <div className="text-[10px] text-gray-400 mb-1.5 truncate"><Briefcase className="inline h-2.5 w-2.5 mr-1" />{lead.company}</div>}
      <div className="flex justify-between items-center mt-2">
        <Badge className={`px-1.5 py-0 rounded-full border border-white/10 bg-white/5 ${leadPriorityColors[lead.priority] || ''} text-[9px]`}>
          {lead.priority}
        </Badge>
        <div className="text-[9px] text-gray-500 capitalize">{lead.source.replace('_', ' ')}</div>
      </div>
    </div>
  );
};

// Droppable column wrapper — ensures empty columns are valid drop targets
const DroppableColumn = ({ id, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'column', status: id } });
  return (
    <div
      ref={setNodeRef}
      className={`p-2 flex flex-col gap-2 flex-1 overflow-y-auto max-h-[70vh] transition-colors duration-200 ${isOver ? (id === 'dropped' ? 'bg-red-500/10 ring-1 ring-inset ring-red-500/30 rounded-b-xl' : 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30 rounded-b-xl') : ''}`}
    >
      {children}
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
  leadStatusLabels,
  leadPriorityColors, 
  leadSourceColors, 
  setSelectedLead, 
  setIsViewLeadOpen 
}) {
  const [activeLead, setActiveLead] = useState(null);
  const [localLeads, setLocalLeads] = useState(leads);

  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

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

  // Find which status column an id belongs to
  const findContainer = (id) => {
    if (leadStatusOptions.includes(id)) return id;
    const lead = localLeads.find(l => (l._id || l.id) === id);
    return lead ? lead.status : null;
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const lead = localLeads.find(l => (l._id || l.id) === active.id);
    setActiveLead(lead);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Move to a different column
    setLocalLeads((prev) => {
      const prevCopy = [...prev];
      const activeItemIndex = prevCopy.findIndex(l => (l._id || l.id) === activeId);
      if (activeItemIndex === -1) return prev;
      
      const activeItem = prevCopy[activeItemIndex];
      const overItems = prev.filter(l => l.status === overContainer);
      
      let newIndex;
      if (leadStatusOptions.includes(overId)) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.findIndex(l => (l._id || l.id) === overId);
        const isBelowOverItem = active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        newIndex = isBelowOverItem ? overIndex + 1 : overIndex;
      }

      // Update the status of the active item
      const updatedItem = { ...activeItem, status: overContainer };
      
      // Remove from old position
      prevCopy.splice(activeItemIndex, 1);
      
      // Find where to insert in the global array
      const itemsInTargetStatus = prevCopy.filter(l => l.status === overContainer);
      let insertIndex = prevCopy.length;
      
      if (newIndex < itemsInTargetStatus.length) {
         const targetItem = itemsInTargetStatus[newIndex];
         insertIndex = prevCopy.findIndex(l => (l._id || l.id) === (targetItem._id || targetItem.id));
      }
      
      prevCopy.splice(insertIndex, 0, updatedItem);
      return prevCopy;
    });
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    const draggedLead = activeLead;
    setActiveLead(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer) return;

    // AUTO-DELETE: If dropped into the 'dropped' (Delete) column, delete the lead
    if (overContainer === 'dropped' && draggedLead && draggedLead.status !== 'dropped') {
      const confirmDelete = window.confirm(`Are you sure you want to delete "${draggedLead.fullName}"? This action cannot be undone.`);
      
      if (confirmDelete) {
        // Remove from local state immediately
        setLocalLeads(prev => prev.filter(l => (l._id || l.id) !== activeId));
        setLeads(prev => prev.filter(l => (l._id || l.id) !== activeId));
        
        try {
          await axios.delete(`${API}/leads/${activeId}`);
          toast.success(`Lead "${draggedLead.fullName}" deleted successfully`);
          fetchLeads(); // Re-sync with server
        } catch (err) {
          console.error(err);
          toast.error('Failed to delete lead');
          fetchLeads(); // Revert on failure
        }
      } else {
        // User cancelled — revert to original position
        fetchLeads();
      }
      return;
    }

    let updatedLeads = [...localLeads];

    // Handle reordering within the same container
    if (activeContainer === overContainer && activeId !== overId) {
      const activeIdx = updatedLeads.findIndex(l => (l._id || l.id) === activeId);
      const overIdx = updatedLeads.findIndex(l => (l._id || l.id) === overId);
      
      if (activeIdx !== -1 && overIdx !== -1) {
        updatedLeads = arrayMove(updatedLeads, activeIdx, overIdx);
      }
    }
    
    // Assign order values based on array index within each status
    let reorderPayload = [];
    leadStatusOptions.forEach(status => {
      const leadsInStatus = updatedLeads.filter(l => l.status === status);
      leadsInStatus.forEach((l, index) => {
        l.order = index;
        reorderPayload.push({ _id: l._id || l.id, status: l.status, order: l.order });
      });
    });

    // Update UI immediately
    setLocalLeads([...updatedLeads]);
    setLeads([...updatedLeads]); // Sync global state on drop end

    try {
      await axios.patch(`${API}/leads/reorder`, { items: reorderPayload });
      
      // Check if it was converted
      if (overContainer === 'converted' && draggedLead && draggedLead.status !== 'converted') {
        toast.success(`Lead converted to client!`);
        fetchClients();
      }
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

  // Custom collision detection: prefer pointerWithin for columns, closestCorners for items
  const collisionDetection = (args) => {
    // First try pointerWithin for more intuitive column drops
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    // Fallback to closestCorners
    return closestCorners(args);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-thin">
        {leadStatusOptions.map(status => {
          const leadsInStatus = localLeads.filter(l => l.status === status);
          return (
            <div 
              key={status} 
              className="flex-shrink-0 w-64 bg-white/5 rounded-xl border border-white/10 flex flex-col snap-start"
            >
              {/* Column Header */}
              <div className={`p-2.5 border-b border-white/10 rounded-t-xl ${leadStatusColors[status] || 'bg-white/10 text-white'}`}>
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold">{(leadStatusLabels && leadStatusLabels[status]) || status.replace('_', ' ')}</h3>
                  <Badge className="bg-white/20 text-current border-none text-[10px] px-1.5 py-0">
                    {leadsInStatus.length}
                  </Badge>
                </div>
              </div>
              
              {/* Column Cards Container — wrapped with DroppableColumn */}
              <DroppableColumn id={status}>
                <SortableContext 
                  id={status}
                  items={leadsInStatus.map(l => l._id || l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2 min-h-[40px]">
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
                      <div className={`text-center py-8 text-sm border-2 border-dashed rounded-xl ${status === 'dropped' ? 'text-red-300/30 border-red-500/10' : 'text-white/20 border-white/5'}`}>
                        {status === 'dropped' ? 'Drop leads here to delete' : 'Drop leads here'}
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DroppableColumn>
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
