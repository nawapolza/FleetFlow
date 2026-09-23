import Swal from 'sweetalert2';

const base = {
  buttonsStyling: false,
  customClass: {
    popup: 'heng-dialog',
    title: 'heng-dialog-title',
    htmlContainer: 'heng-dialog-copy',
    actions: 'heng-dialog-actions',
    confirmButton: 'heng-dialog-confirm',
    cancelButton: 'heng-dialog-cancel',
  },
};

export const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2200,
  timerProgressBar: true,
  customClass: { popup: 'heng-toast', title: 'heng-toast-title', timerProgressBar: 'heng-toast-progress' },
});

export function alertSuccess(title = 'สำเร็จ', text = '') {
  return Swal.fire({
    ...base,
    title,
    text,
    icon: 'success',
    confirmButtonText: 'เรียบร้อย',
  });
}

export function alertError(error, fallback = 'เกิดข้อผิดพลาด') {
  const message = typeof error === 'string' ? error : error?.message || fallback;
  return Swal.fire({
    ...base,
    icon: 'error',
    title: 'ทำรายการไม่สำเร็จ',
    text: message,
    confirmButtonText: 'ตรวจสอบอีกครั้ง',
    customClass: { ...base.customClass, popup: 'heng-dialog heng-dialog-error', confirmButton: 'heng-dialog-confirm is-danger' },
  });
}

let lastToast = { title: '', at: 0 };
function showToast(title, icon = 'success') {
  const now = Date.now();
  if (lastToast.title === title && now - lastToast.at < 1300) return Promise.resolve();
  lastToast = { title, at: now };
  return Toast.fire({ icon, title });
}
export function toastSuccess(title = 'บันทึกสำเร็จ') {
  return showToast(title, 'success');
}
export function toastInfo(title = 'อัปเดตข้อมูลแล้ว') {
  return showToast(title, 'info');
}

export async function confirmDanger(title = 'ยืนยันการลบ', text = 'เมื่อลบแล้วจะย้อนกลับไม่ได้') {
  const res = await Swal.fire({
    ...base,
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันดำเนินการ',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    customClass: { ...base.customClass, popup: 'heng-dialog heng-dialog-warning', confirmButton: 'heng-dialog-confirm is-danger' },
  });
  return res.isConfirmed;
}

export async function confirmAction(title = 'ยืนยันรายการ', text = '') {
  const res = await Swal.fire({
    ...base,
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: 'ดำเนินการต่อ',
    cancelButtonText: 'ย้อนกลับ',
    reverseButtons: true,
  });
  return res.isConfirmed;
}
