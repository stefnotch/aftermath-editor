#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct CapturingGroupId(usize);

pub struct CapturingGroups {
    group_count: usize,
}

impl CapturingGroups {
    pub fn new() -> Self {
        Self { group_count: 0 }
    }

    // Could be safer, but eh
    pub fn add_group(&mut self, group: CapturingGroupId) -> CapturingGroupId {
        if group.get() < self.group_count {
            // We're reusing an existing group
        } else if group.get() == self.group_count {
            // We're adding a new group
            self.group_count += 1;
        } else {
            panic!(
                "Capturing group id too high, expected {} but got {}",
                self.group_count,
                group.get()
            );
        }

        group
    }

    pub fn count(&self) -> usize {
        self.group_count
    }
}

impl CapturingGroupId {
    pub fn new(value: usize) -> Self {
        Self(value)
    }

    pub fn get(&self) -> usize {
        self.0
    }
}
