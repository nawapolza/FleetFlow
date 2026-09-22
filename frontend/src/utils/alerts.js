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

export function toastSuccess(title = 'บันทึกสำเร็จ') {
  return Swal.fire({
    showConfirmButton: false,
    timer: 1750,
    timerProgressBar: true,
    allowOutsideClick: true,
    backdrop: 'rgba(3, 12, 20, .58)',
    title,
    html: '<div class="heng-success-visual" aria-hidden="true"><span class="heng-success-orbit orbit-one"></span><span class="heng-success-orbit orbit-two"></span><span class="heng-success-core"><svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 17 19 7"/></svg></span></div><p class="heng-success-message">ข้อมูลถูกบันทึกและซิงค์เข้าสู่ระบบเรียบร้อยแล้ว</p><div class="heng-success-scan"><i></i></div>',
    customClass: {
      popup: 'heng-success-popup',
      title: 'heng-success-title',
      htmlContainer: 'heng-success-content',
      timerProgressBar: 'heng-success-timer',
    },
  });
}

export function toastInfo(title = 'อัปเดตข้อมูลแล้ว') {
  return Toast.fire({ icon: 'info', title });
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
