import { describe, it, expect } from 'vitest';

describe('Department Matching & Batched Roster Invariants', () => {
  const CANONICAL_DEPARTMENTS = [
    { department_id: 'dept-cse-uuid', name: 'Computer Science and Engineering', code: 'CSE' },
    { department_id: 'dept-ece-uuid', name: 'Electronics and Communication Engineering', code: 'ECE' },
    { department_id: 'dept-me-uuid', name: 'Mechanical Engineering', code: 'ME' },
    { department_id: 'dept-ise-uuid', name: 'Information Science and Engineering', code: 'ISE' },
    { department_id: 'dept-civil-uuid', name: 'Civil Engineering', code: 'CIVIL' }
  ];

  function resolveCanonicalDepartment(input) {
    if (!input || !input.trim()) return null;
    const clean = input.trim().toLowerCase();
    
    // Direct match by code or name
    const directMatch = CANONICAL_DEPARTMENTS.find(
      d => d.code.toLowerCase() === clean || d.name.toLowerCase() === clean
    );
    if (directMatch) return directMatch;

    // Substring match
    const subMatch = CANONICAL_DEPARTMENTS.find(
      d => d.name.toLowerCase().includes(clean) || clean.includes(d.code.toLowerCase())
    );
    return subMatch || null;
  }

  describe('resolveCanonicalDepartment', () => {
    it('resolves standard department acronyms', () => {
      const cse = resolveCanonicalDepartment('CSE');
      expect(cse).not.toBeNull();
      expect(cse?.department_id).toBe('dept-cse-uuid');
      expect(cse?.name).toBe('Computer Science and Engineering');

      const ece = resolveCanonicalDepartment('ece');
      expect(ece).not.toBeNull();
      expect(ece?.department_id).toBe('dept-ece-uuid');
    });

    it('resolves full names with case insensitivity', () => {
      const is = resolveCanonicalDepartment('Information Science and Engineering');
      expect(is).not.toBeNull();
      expect(is?.code).toBe('ISE');
    });

    it('resolves partial matches gracefully', () => {
      const mech = resolveCanonicalDepartment('Mechanical');
      expect(mech).not.toBeNull();
      expect(mech?.code).toBe('ME');
    });

    it('returns null for unrecognized departments', () => {
      expect(resolveCanonicalDepartment('Astronomy & Astrophysics')).toBeNull();
    });
  });

  describe('Batched Student Eligibility Invariant', () => {
    const studentProfiles = [
      { userId: 's1', semester: 4, department_id: 'dept-cse-uuid', status: 'ACTIVE' },
      { userId: 's2', semester: 4, department_id: 'dept-cse-uuid', status: 'ACTIVE' },
      { userId: 's3', semester: 6, department_id: 'dept-cse-uuid', status: 'ACTIVE' }, // wrong semester
      { userId: 's4', semester: 4, department_id: 'dept-ece-uuid', status: 'ACTIVE' }, // wrong dept
      { userId: 's5', semester: 4, department_id: 'dept-cse-uuid', status: 'SUSPENDED' }, // inactive
    ];

    function filterEligibleStudents(students, targetSemester, targetDeptId) {
      return students.filter(s =>
        s.semester === targetSemester &&
        s.department_id === targetDeptId &&
        s.status === 'ACTIVE'
      ).map(s => s.userId);
    }

    it('filters eligible students matching semester, canonical department_id and active status', () => {
      const eligible = filterEligibleStudents(studentProfiles, 4, 'dept-cse-uuid');
      expect(eligible).toEqual(['s1', 's2']);
      expect(eligible.length).toBe(2);
    });

    it('excludes suspended students even if semester and department match', () => {
      const eligible = filterEligibleStudents(studentProfiles, 4, 'dept-cse-uuid');
      expect(eligible).not.toContain('s5');
    });
  });
});
