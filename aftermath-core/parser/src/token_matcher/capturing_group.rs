#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct CapturingGroupId(usize);

pub struct CapturingGroups {
    groups: Vec<CapturingGroupId>,
}

impl CapturingGroups {
    pub fn new() -> Self {
        Self { groups: vec![] }
    }

    pub fn get_or_add_group(&mut self, group: CapturingGroupId) -> CapturingGroupId {
        let group_id = self.groups.iter().position(|g| g == &group);
        match group_id {
            Some(group_id) => CapturingGroupId(group_id),
            None => {
                let group_id = self.groups.len();
                self.groups.push(group);
                CapturingGroupId(group_id)
            }
        }
    }

    pub fn count(&self) -> usize {
        self.groups.len()
    }
}

impl CapturingGroupId {
    pub fn get(&self) -> usize {
        self.0
    }
}
