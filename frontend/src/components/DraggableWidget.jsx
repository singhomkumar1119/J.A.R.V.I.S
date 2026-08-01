import React, { useState, useEffect, useRef } from 'react';
import './DraggableWidget.css';

export default function DraggableWidget({ id, defaultPos, children }) {
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem(`jarvis_widget_${id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return defaultPos;
  });

  const [isMoving, setIsMoving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

  // Handle right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setShowMenu(false);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleStartMove = (e) => {
    e.stopPropagation();
    setShowMenu(false);
    setIsMoving(true);
  };

  const handleSavePos = (e) => {
    e.stopPropagation();
    setShowMenu(false);
    setIsMoving(false);
    localStorage.setItem(`jarvis_widget_${id}`, JSON.stringify(pos));
  };

  // Mouse drag logic
  const handleMouseDown = (e) => {
    if (!isMoving || e.button !== 0) return;
    isDraggingRef.current = true;
    offsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const newX = e.clientX - offsetRef.current.x;
      const newY = e.clientY - offsetRef.current.y;
      setPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pos]);

  return (
    <div
      ref={widgetRef}
      className={`draggable-widget-container ${isMoving ? 'moving' : ''}`}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: isMoving ? 999 : 10,
        cursor: isMoving ? 'grab' : 'default',
        touchAction: 'none'
      }}
    >
      {children}

      {/* Right-click Context Menu */}
      {showMenu && (
        <div 
          className="widget-context-menu"
          style={{ top: `${menuPos.y - pos.y}px`, left: `${menuPos.x - pos.x}px` }}
        >
          <div className="menu-header">WIDGET CONTROL</div>
          
          <button className={`menu-btn move ${isMoving ? 'active' : ''}`} onClick={handleStartMove}>
            <span className="icon">1.</span> ✥ Move
          </button>
          
          <button className="menu-btn save" onClick={handleSavePos}>
            <span className="icon">2.</span> 💾 Save
          </button>
        </div>
      )}

      {/* Visual Indicator when Moving */}
      {isMoving && (
        <div className="moving-badge" onClick={handleSavePos}>
          DRAGGING... (CLICK TO SAVE)
        </div>
      )}
    </div>
  );
}
