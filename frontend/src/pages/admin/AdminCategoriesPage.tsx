import AdminCategoriesTab from '../../components/admin/AdminCategoriesTab';

export default function AdminCategoriesPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Категории проектов</h1>
          <p className="tt-page-subtitle">Управление категориями и классификацией проектов</p>
        </div>
      </div>
      <AdminCategoriesTab />
    </div>
  );
}
