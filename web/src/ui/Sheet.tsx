// Bottom sheet (phone) / centered dialog (wide screens), with drag-to-dismiss.
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useBack } from './back';
import { useWide } from './hooks';

export function Sheet({ open, onClose, title, children, action }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode; // right side of the title bar
}) {
  const wide = useWide();
  const drag = useDragControls();
  useBack(open, onClose);
  // Ignore the click that follows the gesture which opened the sheet (e.g. a swipe
  // released over the freshly mounted backdrop).
  const openedAt = useRef(0);
  useEffect(() => { if (open) openedAt.current = Date.now(); }, [open]);
  const motionProps = wide
    ? { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sheet-layer" key="sheet">
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => Date.now() - openedAt.current > 350 && onClose()}
          />
          <motion.div
            className="sheet"
            role="dialog"
            {...motionProps}
            transition={{ type: 'spring', damping: 34, stiffness: 420 }}
            drag={wide ? false : 'y'}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="sheet-head" onPointerDown={(e) => drag.start(e)}>
              <div className="sheet-grabber" />
              {(title || action) && (
                <div className="sheet-title">
                  <span>{title}</span>
                  {action}
                </div>
              )}
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** iOS-style list of actions inside a sheet. */
export function ActionList({ children }: { children: ReactNode }) {
  return <div className="action-list">{children}</div>;
}

export function Action({ icon, label, onClick, danger, detail, color }: {
  icon?: ReactNode;
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  detail?: ReactNode;
  color?: string;
}) {
  return (
    <motion.button whileTap={{ scale: 0.98 }} className={'action' + (danger ? ' danger' : '')} onClick={onClick}>
      {icon && <span className="action-icon" style={{ color }}>{icon}</span>}
      <span className="action-label">{label}</span>
      {detail && <span className="action-detail">{detail}</span>}
    </motion.button>
  );
}
