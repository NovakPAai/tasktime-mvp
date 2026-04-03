import AdminMonitoringTab from '../../components/admin/AdminMonitoringTab';

export default function AdminMonitoringPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Мониторинг</h1>
          <p className="tt-page-subtitle">Состояние системы и производительность</p>
        </div>
      </div>
      <AdminMonitoringTab />
    </div>
  );
}
