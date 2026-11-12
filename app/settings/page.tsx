"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "../page.module.css";
import AppLoader from "@/components/AppLoader";
import Modal from "@/components/Modal";
import Brand from "@/components/Brand";

type User = { _id: string; email: string; name?: string };
type Member = { userId: string; role: string };
type Role = { name: string; description: string; permissions?: string[] };
type Invitation = { _id: string; email: string; role: string; expiresAt: string };
const roleStyles: Record<string, string> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
};

export default function SettingsPage() {
  const [user, setUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("users");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  const [linkModal, setLinkModal] = useState<{ title: string; url: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyError, setLinkCopyError] = useState("");
  const [deleteInvitationId, setDeleteInvitationId] = useState<string | null>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fetch("/api/users/me")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        !profileMenuButtonRef.current?.contains(event.target) &&
        !profilePopoverRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (section === "users")
      fetch("/api/admin/users")
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data;
        })
        .then((data) => {
          setUsers(data.users);
          setMembers(data.members);
        })
        .catch((error) => showNotice(error.message, "error"));
    if (section === "users")
      fetch("/api/organization/invitations")
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data;
        })
        .then((data) => setInvitations(data.invitations ?? []))
        .catch((error) => showNotice(error.message, "error"));
    if (section === "roles")
      fetch("/api/admin/roles")
        .then((response) => response.json())
        .then((data) => setRoles(data.roles ?? []));
  }, [section]);
  function showNotice(message: string, nextTone: SnackbarTone) {
    setTone(nextTone);
    setNotice(message);
  }
  async function changeRole(userId: string, role: string) {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await response.json();
    showNotice(data.message ?? data.error, response.ok ? "success" : "error");
    if (response.ok)
      setMembers((current) =>
        current.map((member) => (member.userId === userId ? { ...member, role } : member)),
      );
  }
  async function resetPassword(userId: string) {
    const response = await fetch(`/api/admin/users/${userId}`, { method: "POST" });
    const data = await response.json();
    if (response.ok && data.resetUrl) {
      setNotice("");
      setLinkModal({ title: "Password reset link", url: data.resetUrl });
    } else {
      showNotice(data.message ?? data.error, "error");
    }
  }
  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/organization/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await response.json();
    if (response.ok) {
      setInviteEmail("");
      setInvitations((current) => [
        { _id: crypto.randomUUID(), email: inviteEmail, role: inviteRole, expiresAt: "" },
        ...current,
      ]);
      if (data.inviteUrl) {
        setNotice("");
        setLinkModal({ title: "Invitation link", url: data.inviteUrl });
      }
    } else {
      showNotice(data.message ?? data.error, "error");
    }
  }
  async function deleteInvitation(id: string) {
    const response = await fetch(`/api/organization/invitations/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (response.ok) setInvitations((current) => current.filter((item) => item._id !== id));
    setDeleteInvitationId(null);
    showNotice(data.message ?? data.error, response.ok ? "success" : "error");
  }
  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setLinkCopyError("");
    } catch {
      setLinkCopied(false);
      setLinkCopyError("Could not copy automatically. Select the link and copy it manually.");
    }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  const roleFor = (userId: string) =>
    members.find((member) => member.userId === userId)?.role ?? "member";
  const filteredUsers = useMemo(
    () =>
      users.filter((person) =>
        `${person.name ?? ""} ${person.email}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );
  if (!user)
    return (
      <main className={styles.page}>
        <AppLoader label="Loading settings" />
      </main>
    );
  const canViewSettings = user.role === "owner" || user.role === "admin";
  if (!canViewSettings)
    return (
      <main className={styles.page}>
        <nav className={styles.nav}>
          <Brand />
          <div className={styles.navActions}>
            <a className={styles.buttonSecondary} href="/chat">
              Go to chat
            </a>
          </div>
        </nav>
        <section className={styles.accessDenied}>
          <span>!</span>
          <h1>Access denied</h1>
          <p>Organization settings are available only to owners and admins.</p>
          <a className={styles.buttonSecondary} href="/chat">
            Back to chat
          </a>
        </section>
      </main>
    );
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Brand />
        <div className={styles.profileMenu}>
          <button
            className={styles.avatarButton}
            ref={profileMenuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.avatar}>{(user.name || user.email)[0].toUpperCase()}</span>
          </button>
        </div>
        {menuOpen &&
          createPortal(
            <div className={styles.popover} ref={profilePopoverRef}>
              <strong>{user.name || user.email}</strong>
              <small>{user.email}</small>
              <a href="/profile">Update profile</a>
              <button onClick={logout}>Sign out</button>
            </div>,
            document.body,
          )}
      </nav>
      <section className={styles.settingsLayout}>
        <aside className={styles.settingsNav}>
          <p className={styles.eyebrow}>Organization</p>
          <button
            className={section === "users" ? styles.settingsNavActive : ""}
            onClick={() => setSection("users")}
          >
            Users <span className={styles.navCount}>{users.length || ""}</span>
          </button>
          <button
            className={section === "roles" ? styles.settingsNavActive : ""}
            onClick={() => setSection("roles")}
          >
            Roles
          </button>
        </aside>
        <section className={styles.settingsCard}>
          {section === "users" && (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Workspace access</p>
                  <h1>Users</h1>
                  <p className={styles.description}>
                    Manage people and permissions in your organization.
                  </p>
                </div>
                <div className={styles.userStat}>
                  <strong>{users.length}</strong>
                  <span>members</span>
                </div>
              </div>
              <div className={styles.userToolbar}>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users"
                />
                <span>{filteredUsers.length} shown</span>
              </div>
              <form className={styles.inviteForm} onSubmit={inviteUser}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="Invite by email"
                  required
                />
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                  <option value="member">Member</option>
                  {user.role === "owner" && <option value="admin">Admin</option>}
                </select>
                <button className={styles.button} type="submit">
                  Invite user
                </button>
              </form>
              {invitations.length > 0 && (
                <div className={styles.pendingInvites}>
                  <div className={styles.pendingInvitesHeader}>
                    <strong>Pending invitations</strong>
                    <span>{invitations.length}</span>
                  </div>
                  {invitations.map((invitation) => (
                    <div className={styles.pendingInvite} key={invitation._id}>
                      <span>
                        {invitation.email}
                        <small>{invitation.role}</small>
                      </span>
                      <button
                        className={styles.tableAction}
                        onClick={() => setDeleteInvitationId(invitation._id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.userTable}>
                <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                  <strong>Member</strong>
                  <strong>Role</strong>
                  <strong>Actions</strong>
                </div>
                {filteredUsers.map((person) => (
                  <div className={styles.tableRow} key={person._id}>
                    <span className={styles.memberCell}>
                      <span className={styles.avatar}>
                        {(person.name || person.email)[0].toUpperCase()}
                      </span>
                      <span>
                        <strong>{person.name || person.email}</strong>
                        <small>{person.email}</small>
                      </span>
                    </span>
                    <select
                      className={styles.roleSelect}
                      value={roleFor(person._id)}
                      onChange={(event) => changeRole(person._id, event.target.value)}
                      disabled={roleFor(person._id) === "owner" && user.role !== "owner"}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <button
                      className={styles.tableAction}
                      onClick={() => resetPassword(person._id)}
                    >
                      Reset password
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {section === "roles" && (
            <>
              <p className={styles.eyebrow}>Workspace access</p>
              <h1>Roles</h1>
              <p className={styles.description}>
                Roles define what members can do in this organization.
              </p>
              <div className={styles.roleList}>
                {roles.map((role) => (
                  <div className={styles.roleItem} key={role.name}>
                    <div className={styles.roleItemHeader}>
                      <span
                        className={`${styles.roleBadge} ${styles[roleStyles[role.name] ?? "roleMember"]}`}
                      >
                        {role.name}
                      </span>
                      <span className={styles.roleScope}>
                        {role.name === "owner"
                          ? "Highest access"
                          : role.name === "admin"
                            ? "Management access"
                            : "Everyday access"}
                      </span>
                    </div>
                    <p>{role.description}</p>
                    <div className={styles.permissionChips}>
                      {(role.permissions ?? []).map((permission) => (
                        <span key={permission}>{permission}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </section>
      {notice && <Snackbar message={notice} tone={tone} onClose={() => setNotice("")} />}
      {linkModal && (
        <Modal
          title={linkModal.title}
          onClose={() => {
            setLinkModal(null);
            setLinkCopied(false);
            setLinkCopyError("");
          }}
        >
          <p className={styles.modalDescription}>
            {linkModal.title === "Password reset link"
              ? "Share this one-time link securely with the selected member. It expires in one hour."
              : "Share this invitation link with the invited person. It expires in seven days."}
          </p>
          <div className={styles.modalLinkRow}>
            <textarea
              className={styles.modalLinkValue}
              value={linkModal.url}
              readOnly
              rows={3}
              aria-label="Generated link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className={styles.button} type="button" onClick={() => copyLink(linkModal.url)}>
              {linkCopied ? "Copied" : "Copy"}
            </button>
          </div>
          {linkCopyError && <p className={styles.modalDescription}>{linkCopyError}</p>}
        </Modal>
      )}
      {deleteInvitationId && (
        <Modal title="Delete invitation" onClose={() => setDeleteInvitationId(null)}>
          <p className={styles.modalDescription}>
            This will invalidate the invitation link. The person will not be able to join with it.
          </p>
          <div className={styles.modalActions}>
            <button className={styles.buttonSecondary} onClick={() => setDeleteInvitationId(null)}>
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              onClick={() => deleteInvitation(deleteInvitationId)}
            >
              Delete invitation
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
