import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Space, Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as categoriesApi from '../../api/project-categories';
import type { ProjectCategory } from '../../types';

export default function AdminCategoriesTab() {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const [editCategory, setEditCategory] = useState<ProjectCategory | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await categoriesApi.listCategories());
    } catch {
      void message.error('Ошибка загрузки категорий');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditCategory(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (cat: ProjectCategory) => {
    setEditCategory(cat);
    form.setFieldsValue({ name: cat.name, description: cat.description ?? '' });
    setModalOpen(true);
  };

  const handleSave = async (values: { name: string; description?: string }) => {
    setSaveLoading(true);
    try {
      if (editCategory) {
        const updated = await categoriesApi.updateCategory(editCategory.id, values);
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        void message.success('Категория обновлена');
      } else {
        const created = await categoriesApi.createCategory(values);
        setCategories((prev) => [...prev, created]);
        void message.success('Категория создана');
      }
      setModalOpen(false);
    } catch {
      void message.error('Ошибка сохранения');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = (cat: ProjectCategory) => {
    Modal.confirm({
      title: `Удалить категорию "${cat.name}"?`,
      content: 'Проекты этой категории будут без категории, но не удалены.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await categoriesApi.deleteCategory(cat.id);
          setCategories((prev) => prev.filter((c) => c.id !== cat.id));
          void message.success('Категория удалена');
        } catch {
          void message.error('Ошибка удаления');
        }
      },
    });
  };

  const columns: ColumnsType<ProjectCategory> = [
    { title: 'Название', dataIndex: 'name' },
    {
      title: 'Описание',
      dataIndex: 'description',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Проекты',
      dataIndex: 'projects',
      render: (projects: ProjectCategory['projects']) =>
        projects && projects.length > 0
          ? projects.map((p) => <Tag key={p.id}>{p.key}</Tag>)
          : '—',
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: ProjectCategory) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>Редактировать</Button>
          <Button size="small" danger onClick={() => handleDelete(record)}>Удалить</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Создать категорию
        </Button>
      </div>

      <Table
        className="tt-table"
        rowKey="id"
        columns={columns}
        dataSource={categories}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      <Modal
        open={modalOpen}
        title={editCategory ? 'Редактировать категорию' : 'Создать категорию'}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отменить"
        confirmLoading={saveLoading}
      >
        <Form form={form} layout="vertical" onFinish={(v) => { void handleSave(v); }}>
          <Form.Item name="name" label="Название категории" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
